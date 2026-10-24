import { createCloneWidgetSubCase } from '@/application/useCases/widget/subs/cloneWidget';
import { createCloneWidgetToWidgetListSubCase } from '@/application/useCases/shelf/subs/cloneWidgetToWidgetList';
import { createCloneWidgetToWidgetLayoutSubCase } from '@/application/useCases/workflow/subs/cloneWidgetToWidgetLayout';
import { createCloneWidgetLayoutItemSubCase } from '@/application/useCases/workflow/subs/cloneWidgetLayoutItem';
import { createCloneWorkflowSubCase } from '@/application/useCases/workflow/subs/cloneWorkflow';
import { createPasteWidgetToShelfUseCase } from '@/application/useCases/shelf/pasteWidgetToShelf';
import { createPasteWidgetToWorkflowUseCase } from '@/application/useCases/workflow/pasteWidgetToWorkflow';
import { createPasteWorkflowUseCase } from '@/application/useCases/workflowSwitcher/pasteWorkflow';
import { createSaveChangesInProjectManagerUseCase } from '@/application/useCases/projectManager/saveChangesInProjectManager';
import { createDropOnTopBarListUseCase } from '@/application/useCases/dragDrop/dropOnTopBarList';
import { createDropOnWorktableLayoutUseCase } from '@/application/useCases/dragDrop/dropOnWorktableLayout';
import { fixtureModalScreensData } from '@tests/base/state/fixtures/modalScreens';
import { fixtureProjectSwitcher } from '@tests/base/state/fixtures/projectSwitcher';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureWidgetA } from '@tests/base/fixtures/widget';
import { fixtureWidgetTypeA } from '@tests/base/fixtures/widgetType';
import { fixtureWorkflowA } from '@tests/base/fixtures/workflow';
import { fixtureProjectA, fixtureProjectB } from '@tests/base/fixtures/project';
import { fixtureWidgetLayoutItemA } from '@tests/base/fixtures/widgetLayout';
import { dragDropStateActions } from '@/base/state/actions';

const actions = ['shelf', 'widget', 'workflow', 'project', 'dropShelf', 'dropWorkflow'] as const;

describe.each(actions)('%s copy failure', action => {
  it.each(['false', 'reject'])('should report %s once and retain the original state', async failure => {
    const type = fixtureWidgetTypeA();
    const widget = fixtureWidgetA({ type: type.id });
    const workflow = fixtureWorkflowA({ layout: [fixtureWidgetLayoutItemA({ widgetId: widget.id })] });
    const project = fixtureProjectA({ workflowIds: [workflow.id], currentWorkflowId: workflow.id });
    const duplicate = fixtureProjectB({ workflowIds: [] });
    const dragging = action.startsWith('drop');
    const [appStore] = await fixtureAppStore(fixtureAppState({
      entities: {
        widgets: { [widget.id]: widget }, widgetTypes: { [type.id]: type },
        workflows: { [workflow.id]: workflow }, projects: { [project.id]: project }
      },
      ui: {
        dragDrop: dragging ? { from: { palette: { widgetCopyId: 'widget-copy' } } } : {},
        projectSwitcher: fixtureProjectSwitcher({ currentProjectId: project.id, projectIds: [project.id] }),
        copy: {
          widgets: { list: ['widget-copy'], entities: { 'widget-copy': { id: 'widget-copy', entity: widget, deps: [] } } },
          workflows: { list: ['workflow-copy'], entities: {
            'workflow-copy': { id: 'workflow-copy', entity: workflow, deps: { widgets: { [widget.id]: widget } } }
          } }
        },
        modalScreens: {
          order: ['projectManager'],
          data: fixtureModalScreensData({ projectManager: {
            projects: { [project.id]: project, [duplicate.id]: duplicate },
            projectIds: [project.id, duplicate.id], duplicateProjectIds: { [duplicate.id]: project.id },
            deleteProjectIds: {}, currentProjectId: project.id
          } })
        }
      }
    }));
    const original = appStore.get();
    const onCopyError = jest.fn();
    const copyObjectData = failure === 'false'
      ? jest.fn().mockResolvedValue(false) : jest.fn().mockRejectedValue(new Error('Disk failed'));
    const idGenerator = () => 'clone-id';
    const cloneWidgetSubCase = createCloneWidgetSubCase({
      idGenerator, onCopyError, widgetDataStorageManager: { copyObjectData, getObject: jest.fn() }
    });
    const cloneWidgetToWidgetListSubCase = createCloneWidgetToWidgetListSubCase({
      cloneWidgetSubCase, addItemToWidgetListSubCase: jest.fn()
    });
    const cloneWidgetToWidgetLayoutSubCase = createCloneWidgetToWidgetLayoutSubCase({
      cloneWidgetSubCase, addItemToWidgetLayoutSubCase: jest.fn()
    });
    const cloneWorkflowSubCase = createCloneWorkflowSubCase({
      idGenerator, cloneWidgetLayoutItemSubCase: createCloneWidgetLayoutItemSubCase({ idGenerator, cloneWidgetSubCase })
    });
    const deactivateWorkflowUseCase = jest.fn();
    const run = {
      shelf: () => createPasteWidgetToShelfUseCase({ appStore, cloneWidgetToWidgetListSubCase })('widget-copy', null),
      widget: () => createPasteWidgetToWorkflowUseCase({ appStore, cloneWidgetToWidgetLayoutSubCase })('widget-copy', workflow.id),
      workflow: () => createPasteWorkflowUseCase({ appStore, cloneWorkflowSubCase, deactivateWorkflowUseCase })('workflow-copy'),
      project: () => createSaveChangesInProjectManagerUseCase({
        appStore, cloneWorkflowSubCase, deactivateWorkflowUseCase, createWorkflowSubCase: jest.fn()
      })(),
      dropShelf: () => createDropOnTopBarListUseCase({
        appStore, idGenerator, cloneWidgetToWidgetListSubCase, createWidgetSubCase: jest.fn(), addItemToWidgetListSubCase: jest.fn()
      })(null),
      dropWorkflow: () => createDropOnWorktableLayoutUseCase({
        appStore, idGenerator, cloneWidgetToWidgetLayoutSubCase, createWidgetSubCase: jest.fn(), addItemToWidgetLayoutSubCase: jest.fn()
      })(workflow.id, { x: 0, y: 0 })
    }[action];
    await expect(run()).resolves.toBeUndefined();
    expect(copyObjectData).toHaveBeenCalledTimes(1);
    expect(onCopyError).toHaveBeenCalledTimes(1);
    expect(appStore.get()).toEqual(dragging ? dragDropStateActions.resetAll(original) : original);
    expect(deactivateWorkflowUseCase).not.toHaveBeenCalled();
  });
});
