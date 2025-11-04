import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  InputDialog,
  showDialog,
  showErrorMessage,
  Dialog
} from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { requestAPI } from './request';

/**
 * Initialization data for the ol-jupyter-authoring extension.
 */

namespace CommandIDs {
  export const saveToS3 = 'filebrowser:s3-save';
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ol-jupyter-authoring:plugin',
  description:
    'Jupyter authoring extension for OpenLearning-hosted Jupyter notebooks ',
  autoStart: true,
  requires: [IMainMenu],
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    mainMenu: IMainMenu,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log('JupyterLab extension ol-jupyter-authoring is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log(
            'ol-jupyter-authoring settings loaded:',
            settings.composite
          );
          // This shouldn't be necessary long term, but for testing it may be useful to keep settings user editable.
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for ol-jupyter-authoring.',
            reason
          );
        });
    }
    app.commands.addCommand(CommandIDs.saveToS3, {
      label: 'Save to S3',
      execute: async args => {
        console.log('Save to S3 command executed with args:', args);
        const confirmedSave = await showDialog({
          title: 'Save to S3',
          body: "Please ensure you've saved your work before continuing with upload.",
          buttons: [Dialog.okButton(), Dialog.cancelButton()]
        });

        if (!confirmedSave.button.accept) {
          return;
        }

        const courseName = await InputDialog.getText({
          title: 'Enter Course Name'
        });

        if (!courseName.button.accept) {
          // If they select cancel, don't attempt to upload to S3
          return;
        }

        requestAPI<any>(`s3-save?course=${courseName.value}`)
          .then(data => {
            if (data.error) {
              console.log('Error saving to S3:', data.error);
              showErrorMessage(
                'Save to S3 Failed',
                `Failed to save notebook to S3. See console for details. \n${data.error}`,
                [Dialog.okButton()]
              );
              return;
            } else {
              // This catch will only work if there's an unhandled error
              showDialog({
                title: 'Save to S3',
                body: 'Notebook saved to S3 successfully.',
                buttons: [Dialog.okButton()]
              });
              console.log(data);
            }
          })
          .catch(reason => {
            showErrorMessage(
              'Save to S3 Failed',
              `Failed to save notebook to S3. See console for details. \n${reason}`,
              [Dialog.okButton()]
            );
            return;
          });
      }
    });
    mainMenu.fileMenu.addGroup(
      [
        {
          command: CommandIDs.saveToS3
        }
      ],
      40
    );
  }
};

export default plugin;
