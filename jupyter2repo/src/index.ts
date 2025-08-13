/**
 * Minimal JupyterLab extension to package a pip requirements.txt, runtime.txt and notebook file into a docker2repo repo from within a running jupyter notebook
 * Prerequisites:
 * - gh_scoped_creds installed in kernel (via %pip install gh-scoped-creds if necessary)
 * - GH app configured per instructions at https://github.com/jupyterhub/gh-scoped-creds?tab=readme-ov-file#github-app-configuration
 * - Instantiated repo that the contents will be pushed to.
 * - N.B. This is all pretty unsafe; we're taking untrusted input and jamming it into the running kernel.
 *   - Luckily if we only need a known MIT set up app install, we don't need to take as much user input for this. It's only useful for testing!
 *
 * Limitations:
 * - This only persists the active notebook and running kernel's python requirements.txt
 * - This assumes that all jupyter runtimes are Python 3.13.
 * - The three persisted files are stored in the root of the target repo, meaning that right now this can only store 1 notebook per repo
 * - No provisions for data file storage
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette,
  InputDialog,
  showDialog,
  Dialog,
  MainAreaWidget
} from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { KernelMessage } from '@jupyterlab/services';
import { UUID } from '@lumino/coreutils';
import { OutputArea, OutputAreaModel } from '@jupyterlab/outputarea';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
  isErrorMsg,
  isStreamMsg,
  isExecuteResultMsg
} from '@jupyterlab/services/lib/kernel/messages';

let outputArea: OutputArea | null = null;
const githubRepoRegex =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
const GH_APP_ID_SETTING_KEY = 'GH_APP_ID';
const GH_URL_SETTING_KEY = 'GH_APP_URL';
const PLUGIN_ID = 'jupyter2repo:plugin';

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID, // TODO: Not sure if this is the best naming scheme, but there's some requirements around its structure matching settings schema
  autoStart: true,
  requires: [
    ICommandPalette,
    INotebookTracker,
    IRenderMimeRegistry,
    ISettingRegistry
  ],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    rendermime: IRenderMimeRegistry,
    settingRegistry: ISettingRegistry
  ) => {
    console.log('Jupyter2Repo extension is activated!');
    const { commands } = app;

    const commandId = 'python-runner:run';
    commands.addCommand(commandId, {
      label: 'Save Notebook to Github',
      execute: async () => {
        const settings = await settingRegistry.load(PLUGIN_ID);
        const ghClientID = settings.get(GH_APP_ID_SETTING_KEY)
          .composite as string;
        const ghAppUrl = settings.get(GH_URL_SETTING_KEY).composite as string;
        const current = tracker.currentWidget;
        if (!current) {
          await showDialog({
            title: 'Warning',
            body: 'No active notebook - cannot.'
          });
          return;
        }

        const notebookFilename = current.context.localPath;

        const session = current.sessionContext.session;
        if (!session?.kernel) {
          await showDialog({
            title: 'Warning',
            body: 'No active kernel - cannot save.'
          });
          return;
        }

        //TODO - pull this log panel init into it's own function
        // Create OutputArea model to use as a Log Panel.
        const model = new OutputAreaModel({ trusted: true });
        outputArea = new OutputArea({
          model,
          rendermime: rendermime
        });

        const widget = new MainAreaWidget({ content: outputArea });
        widget.title.label = 'Log Panel';
        widget.title.closable = true;

        // Show panel immediately on startup
        app.shell.add(widget, 'main');

        const ghTargetRepoResponse = await InputDialog.getText({
          title: 'Provide repo to push requirements to'
        });
        const ghTargetRepo = ghTargetRepoResponse.value;
        if (![ghClientID, ghAppUrl, ghTargetRepo].every(isNotEmpty)) {
          logMessage(
            'All fields must be filled out in order to save notebook.'
          );
          return;
        }

        if (ghTargetRepo !== null && !githubRepoRegex.test(ghTargetRepo)) {
          logMessage(
            'Repo must be a valid HTTPS Github repository url of the format "https://github.com/user/repo.git"'
          );
          return;
        }

        logMessage(
          `Using client ID ${ghClientID} and URL ${ghAppUrl}. Will push to ${ghTargetRepo}`
        );

        // TODO: We should skip this if we're already credentialed because it's definitely the most annoying part of the process
        // Could do this either by cloning the repo and attempting a push --dry-run or by snagging the access token from the temporary file or from the git config
        // Need to play around more with this
        const auth_command = `!gh-scoped-creds --client-id='${ghClientID}' --github-app-url='${ghAppUrl}'`;

        const authFuture = session.kernel.requestExecute({
          code: auth_command
        });

        authFuture.onIOPub = logToConsoleArea;

        await authFuture.done;

        // Clone target repo, create and add requirements.txt, push to repo.
        // N.B. This confirmation is necessary because after completing the gh_scoped_creds command the kernel will have auth credentials,
        // but the user may not have adjusted the app settings yet to allow access to the specified repo.
        const proceed = await askUserConfirmation(
          'Confirm Permissions',
          `Please confirm that you have granted the app access to the specified repo before continuing. This can be modified at ${ghAppUrl}`
        );
        if (proceed) {
          logMessage('Pushing requirements to repo');
          const targetDirectory = UUID.uuid4();
          // TODO: This hardcodes the version at python 3.11; we should probably derive this from whatever the kernel is running
          const gitCommands = `
        %%bash
        git clone "${ghTargetRepo}" ${targetDirectory}
        cp "${notebookFilename}" ${targetDirectory}/
        cd ${targetDirectory}
        pip freeze > requirements.txt
        echo $(python -c "import sys; print(f'python-{sys.version_info.major}.{sys.version_info.minor}')") > runtime.txt
        git add requirements.txt
        git add runtime.txt
        git add "$(basename "${notebookFilename}")"
        echo 'Pushing to github'
        git commit -m 'Updating requirements.txt'
        git push origin main
        echo 'Cleaning up checkout'
        cd ..
        rm -rf ${targetDirectory} 
        
        `;

          const gitFuture = session.kernel.requestExecute({
            code: gitCommands
          });
          gitFuture.onIOPub = logToConsoleArea;

          await gitFuture.done;
        } else {
          logMessage('Aborting git operations');
        }
      }
    });

    // Add command to the palette
    palette.addItem({ command: commandId, category: 'Extension Examples' });
  }
};

const logToConsoleArea = (msg: KernelMessage.IIOPubMessage) => {
  if (isStreamMsg(msg)) {
    logMessage((msg as KernelMessage.IStreamMsg).content.text);
  } else if (isErrorMsg(msg)) {
    const errorMessage = msg as KernelMessage.IErrorMsg;
    const { ename, evalue, traceback } = errorMessage.content;
    const errorText = `${ename}: ${evalue}\n${traceback.join('\n')}`;
    logMessage(errorText);
  } else if (isExecuteResultMsg(msg)) {
    const content = (msg as KernelMessage.IExecuteResultMsg).content;
    if (content.data['text/plain']) {
      logMessage(content.data['text/plain'] as string);
    }
  }
};

function logMessage(text: string) {
  if (!outputArea) {
    console.warn('Log panel not created yet');
    return;
  }
  // Add as a plain text output
  outputArea.model.add({
    output_type: 'stream',
    name: 'stdout',
    text: text + '\n'
  });
}

function isNotEmpty(value: string | null | undefined) {
  return value !== null && value !== undefined && value !== '';
}

async function askUserConfirmation(
  title: string,
  message: string
): Promise<boolean> {
  const result = await showDialog({
    title: title,
    body: message,
    buttons: [
      Dialog.cancelButton({ label: 'Cancel' }),
      Dialog.okButton({ label: 'Confirm' })
    ]
  });

  return result.button.accept; // true if OK clicked, false otherwise
}

export default plugin;
