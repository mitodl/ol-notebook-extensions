import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { requestAPI } from './request';

/**
 * Initialization data for the ol-jupyter-authoring extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ol-jupyter-authoring:plugin',
  description: 'Jupyter authoring extension for OpenLearning-hosted Jupyter notebooks ',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension ol-jupyter-authoring is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('ol-jupyter-authoring settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for ol-jupyter-authoring.', reason);
        });
    }

    requestAPI<any>('hello')
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The ol_jupyter_authoring server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
