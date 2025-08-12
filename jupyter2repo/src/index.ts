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

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

let outputArea: OutputArea | null = null;

/**
 * The extension plugin definition.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'python-runner-extension',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker, IRenderMimeRegistry],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    rendermime: IRenderMimeRegistry
  ) => {
    console.log('Jupyter2Repo extension is activated!');

    const { commands } = app;

    // Command to run Python code
    const commandId = 'python-runner:run';
    commands.addCommand(commandId, {
      label: 'Save Notebook to Github',
      execute: async () => {
        const current = tracker.currentWidget;
        if (!current) {
          await showDialog({
            title: 'Warning',
            body: 'No active notebook - cannot save.'
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

        // Create OutputArea model
        const model = new OutputAreaModel({ trusted: true });
        outputArea = new OutputArea({
          model,
          rendermime: rendermime
        });

        // Wrap it in a MainAreaWidget
        const widget = new MainAreaWidget({ content: outputArea });
        widget.title.label = 'Log Panel';
        widget.title.closable = true;

        // Show panel immediately on startup
        app.shell.add(widget, 'main');

        const ghClientIDResponse = await InputDialog.getText({
          title: 'Provide client ID for preconfigured GH app'
        });

        const ghClientID = ghClientIDResponse.value;

        const ghAppUrlResponse = await InputDialog.getText({
          title: 'Provide public app URL'
        });
        const ghAppUrl = ghAppUrlResponse.value;

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
        logMessage(
          `Using client ID ${ghAppUrl} and URL ${ghAppUrl}. Will push to ${ghTargetRepo}`
        );

        // TODO: We should skip this if we're already credentialed because it's definitely the most annoying part of the process
        // Could do this either by cloning the repo and attempting a push --dry-run or by snagging the access token from the temporary file or from the git config
        // Need to play around more with this

        // TODO: This should just use the line magic cli option instead of calling main directly
        const auth_command = `import gh_scoped_creds
          gh_scoped_creds.main(['--client-id','${ghClientID}', '--github-app-url', '${ghAppUrl}'])`;

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
          'Please confirm that you have granted the app access to the specified repo before continuing'
        );
        if (proceed) {
          logMessage('Pushing requirements to repo');
          const targetDirectory = UUID.uuid4();
          // TODO: This hardcodes the version at python 3.11; we should probably derive this from whatever the kernel is running
          const gitCommands = `
        %%bash
        git clone ${ghTargetRepo} ${targetDirectory}
        cp ${notebookFilename} ${targetDirectory}/${notebookFilename}
        cd ${targetDirectory}
        pip freeze > requirements.txt
        echo 'python-3.11' > runtime.txt
        git add requirements.txt
        git add runtime.txt
        git add ${notebookFilename}
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
  if (msg.header.msg_type === 'stream') {
    logMessage((msg.content as any).text);
  }
  if (msg.header.msg_type === 'error') {
    logMessage((msg.content as any).text);
  }
  if (msg.header.msg_type === 'execute_result') {
    logMessage((msg.content as any).text);
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
