import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { InputDialog } from '@jupyterlab/apputils';
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
        const courseName = await InputDialog.getText({
          title: 'Enter Course Name'
        });

        requestAPI<any>(`s3-save?course=${courseName.value}`)
          .then(data => {
            console.log(data);
          })
          .catch(reason => {
            console.error(
              `The ol_jupyter_authoring server extension appears to be missing.\n${reason}`
            );
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
