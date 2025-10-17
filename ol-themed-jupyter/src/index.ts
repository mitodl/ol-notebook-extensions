import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { LabIcon } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';
// @ts-expect-error: Suppressing extraneous error
import mitJupyterSvgStr from '../style/logo.svg';

export const mitJupyterIcon = new LabIcon({
  name: 'ui-components:mit-jupyter',
  svgstr: mitJupyterSvgStr
});
/**
 * Initialization data for the ol-themed-jupyter extension.
 */

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ol-themed-jupyter:plugin',
  description: 'Provides MIT OpenLearning themes for Jupyter',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    const node = document.createElement('a');
    node.href = `https://learn.mit.edu/dashboard`;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    const logo = new Widget({ node });

    mitJupyterIcon.element({
      container: node,
      elementPosition: 'center',
      padding: '2px 2px 2px 8px',
      height: '28px',
      width: 'auto',
      cursor: 'pointer',
      margin: 'auto'
    });
    logo.id = 'jp-NotebookLogo';
    app.shell.add(logo, 'top', { rank: 0 });
  }
};

export default plugin;
