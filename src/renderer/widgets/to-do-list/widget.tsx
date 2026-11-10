/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBar, ActionBarItems, ReactComponent, WidgetReactComponentProps, delete14Svg, moveItemInList } from '@/widgets/appModules';
import styles from './widget.module.scss';
import { Settings } from './settings';
import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createContextMenuFactory } from '@/widgets/to-do-list/contextMenu';
import { createActionBarItems } from '@/widgets/to-do-list/actionBar';
import clsx from 'clsx';
import { addItem, deleteItem, editItem, markComplete, markIncomplete } from '@/widgets/to-do-list/actions';
import { ActiveItemEditorState, ToDoListState, maxTextLength, sanitizeLoadedToDoListState } from '@/widgets/to-do-list/state';
import { focusItemInput, scrollToItemInput, selectAllInItemInput } from '@/widgets/to-do-list/dom';
import { getOrCreateTodoListSaver, getTodoListState, setTodoListState, useTodoListState } from '@/widgets/to-do-list/todoStore';
import { ToDoListAiApi } from '@/widgets/to-do-list/aiActions';

const dataKey = 'todo';

function scopeForEnv(env: WidgetReactComponentProps<Settings>['env']): string {
  return env.area === 'workflow' ? env.projectId : 'app';
}

function ToDoInner({widgetApi, settings, env}: WidgetReactComponentProps<Settings>) {
  const scope = scopeForEnv(env);
  const addItemTopInputRef = useRef<HTMLInputElement>(null);
  const addItemBottomInputRef = useRef<HTMLInputElement>(null);
  const editItemInputRef = useRef<HTMLInputElement>(null);
  const {updateActionBar, setContextMenuFactory, dataStorage, exposeApi, confirm} = widgetApi;
  // Shared in-memory store — sibling widgets in the same scope subscribe to
  // the same map entry, so any setState() reaches them synchronously without
  // an IPC roundtrip. Disk persistence still happens via debounced setJson.
  const { state: toDoList, setState: setStoreToDoList } = useTodoListState(scope);
  const [activeItemEditorState, setActiveItemEditorState] = useState<ActiveItemEditorState>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dragState, setDragState] = useState<{
    draggingItemId: number | null;
    draggingOverItemId: number | null;
  } | null>(null);


  // Safe under the contract that getToDoList is only invoked from handlers
  // mounted under the `toDoList ?` JSX gate or from effects that early-out
  // when toDoList is undefined. The store's current list, not this render's: a
  // sibling widget or an AI action can change it before this widget re-renders
  // (and Delete Completed Items awaits a dialog), and an edit built on an older
  // list would save over that change.
  const getToDoList = useCallback(() => getTodoListState(scope) as ToDoListState, [scope]);

  // Shorter debounce than typical text widgets: to-do actions (checkbox toggle,
  // item add/delete/reorder) are discrete operations where a fast propagation
  // matters more than coalescing a stream of keystrokes. The saver is per-scope
  // (not per-widget), so two siblings editing in quick succession produce one
  // disk write of the latest state instead of two races. The returned saver has
  // stable identity per scope, so no `useMemo` is needed. Each save passes this
  // widget's own writer, so the write goes through the widget that queued it.
  const saveData = getOrCreateTodoListSaver(scope);

  // Hydrate the store from disk on the first widget mount per scope. Once
  // any widget has populated the store, later mounts skip the read — they
  // pick up state straight from the store.
  useEffect(() => {
    if (toDoList !== undefined) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const loaded = await dataStorage.getJson(dataKey);
      if (cancelled || getTodoListState(scope) !== undefined) {
        return;
      }
      setTodoListState(scope, sanitizeLoadedToDoListState(loaded));
    })().catch(() => {
      if (!cancelled) {
        setLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scope, dataStorage, toDoList]);

  const setToDoListAndSave = useCallback((next: ToDoListState) => {
    setStoreToDoList(next);
    saveData(next, (data) => dataStorage.setJson(dataKey, data));
  }, [dataStorage, saveData, setStoreToDoList])

  // The checkbox's handler. AI setDone calls it too, so both log the same activity.
  const setItemDone = useCallback((itemId: number, done: boolean) => {
    const item = getTodoListState(scope)?.items.find(i => i.id === itemId);
    // Already so (an agent repeating a call): no second usage log, no move to the bottom.
    if (!item || item.isDone === done) {
      return;
    }
    if (done) {
      markComplete(itemId, settings.doneToBottom, getToDoList, setToDoListAndSave);
      if (item.text.trim() !== '') {
        widgetApi.logActivity('todo_done', { text: item.text.trim() });
      }
    } else {
      markIncomplete(itemId, getToDoList, setToDoListAndSave);
    }
  }, [scope, settings.doneToBottom, getToDoList, setToDoListAndSave, widgetApi]);

  // AI actions (aiActions.ts) edit through this widget's own store and save path.
  // The exposed object closes over only the scope and a ref, and is cleared on
  // unmount, so the app store never holds this component (pitfalls: exposed API leaks).
  const setForAiRef = useRef(setToDoListAndSave);
  const setDoneForAiRef = useRef(setItemDone);
  useEffect(() => {
    setForAiRef.current = setToDoListAndSave;
    setDoneForAiRef.current = setItemDone;
  }, [setToDoListAndSave, setItemDone]);
  useEffect(() => {
    const todo: ToDoListAiApi = {
      get: () => getTodoListState(scope),
      set: (s) => setForAiRef.current(s),
      setDone: (itemId, done) => setDoneForAiRef.current(itemId, done),
    };
    exposeApi({ todo });
    return () => exposeApi({});
  }, [exposeApi, scope]);

  // Persist a pending change when the app quits (beforeunload) or the widget
  // unmounts — otherwise an edit made within the (short) debounce window would
  // be lost. The saver is per-scope, so flushing from any sibling is correct.
  useEffect(() => {
    const flush = () => saveData.flush();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [saveData])

  // The menu and the action bar read the list when used, so they are set once the list exists, not on every change.
  const hasToDoList = toDoList !== undefined;
  useEffect(() => {
    if (hasToDoList) {
      updateActionBar(createActionBarItems(getToDoList, setToDoListAndSave, setActiveItemEditorState));
    }
  }, [getToDoList, hasToDoList, setToDoListAndSave, updateActionBar]);

  // Delete Completed Items saves after a dialog: not once this widget is gone (deleted, or moved by an AI action),
  // or it would write through a stale data storage. Only a real unmount counts (a settings change re-runs effects).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (hasToDoList) {
      const saveWhileMounted = (next: ToDoListState) => {
        if (mountedRef.current) {
          setToDoListAndSave(next);
        }
      };
      setContextMenuFactory(
        createContextMenuFactory(settings, getToDoList, saveWhileMounted, setActiveItemEditorState, confirm)
        );
    }
  }, [getToDoList, hasToDoList, setContextMenuFactory, setToDoListAndSave, settings, confirm]);

  useEffect(() => {
    if (activeItemEditorState!==null) {
      if (activeItemEditorState.id==='add-top' && addItemTopInputRef.current) {
        focusItemInput(addItemTopInputRef.current);
        scrollToItemInput(addItemTopInputRef.current);
      } else if (activeItemEditorState.id==='add-bottom' && addItemBottomInputRef.current) {
        focusItemInput(addItemBottomInputRef.current);
        scrollToItemInput(addItemBottomInputRef.current);
      } else if (editItemInputRef.current) {
        focusItemInput(editItemInputRef.current);
        selectAllInItemInput(editItemInputRef.current);
      }
    }
  }, [activeItemEditorState])

  const addItemInputBlurHandler = useCallback((e: React.FocusEvent<HTMLInputElement, Element>, isTop: boolean) => {
    addItem(e.target.value, isTop, getToDoList, setToDoListAndSave);
    e.target.value='';
    if(isTop) {
      setActiveItemEditorState(null);
    }
  }, [getToDoList, setToDoListAndSave])

  const addItemInputKeyDownHandler = useCallback((e: React.KeyboardEvent<HTMLInputElement>, isTop: boolean) => {
    if (e.key === 'Enter') {
      addItem((e.target as HTMLInputElement).value, isTop, getToDoList, setToDoListAndSave);
      (e.target as HTMLInputElement).value='';
      setActiveItemEditorState(isTop ? {id: 'add-top'} : {id: 'add-bottom'});
    } else if (e.key === 'Escape') {
      (e.target as HTMLInputElement).value='';
      setActiveItemEditorState(null);
    }
  }, [getToDoList, setToDoListAndSave])

  const editItemInputBlurHandler = useCallback((e: React.FocusEvent<HTMLInputElement, Element>, itemId: number) => {
    editItem(itemId, e.target.value, getToDoList, setToDoListAndSave);
    setActiveItemEditorState(null);
  }, [getToDoList, setToDoListAndSave])

  const editItemInputKeyDownHandler = useCallback((e: React.KeyboardEvent<HTMLInputElement>, itemId: number) => {
    if (e.key === 'Enter') {
      editItem(itemId, (e.target as HTMLInputElement).value, getToDoList, setToDoListAndSave);
      setActiveItemEditorState(null);
    } else if (e.key === 'Escape') {
      (e.target as HTMLInputElement).value='';
      setActiveItemEditorState(null);
    }
  }, [getToDoList, setToDoListAndSave])

  const createDoneActionBarItems: (itemId: number) => ActionBarItems = useCallback((itemId) => [{
    enabled: true,
    icon: delete14Svg,
    id: 'DELETE-ITEM',
    title: 'Delete Item',
    doAction: async () => {
      deleteItem(itemId, getToDoList, setToDoListAndSave);
    }
  }], [getToDoList, setToDoListAndSave])

  const itemDragStartHandler = useCallback((_evt: DragEvent<HTMLElement>, itemId: number) => {
    setDragState({
      draggingItemId: itemId,
      draggingOverItemId: null
    })
  }, [])

  const itemDragEndHandler = useCallback((_evt: DragEvent<HTMLElement>, _itemId: number) => {
    setDragState(null);
  }, [])

  const itemDragEnterHandler = useCallback((_evt: DragEvent<HTMLElement>, itemId: number) => {
    if (dragState) {
      setDragState({
        ...dragState,
        draggingOverItemId: itemId
      });
    }
  }, [dragState])

  const itemDragLeaveHandler = useCallback((_evt: DragEvent<HTMLElement>, _itemId: number) => {
    if (dragState) {
      setDragState({
        ...dragState,
        draggingOverItemId: null
      });
    }
  }, [dragState])

  const itemDragOverHandler = useCallback((evt: DragEvent<HTMLElement>, itemId: number) => {
    if (dragState !== null) {
      if (dragState.draggingOverItemId !== itemId) {
        setDragState({
          ...dragState,
          draggingOverItemId: itemId
        });
      }
      evt.preventDefault();
      evt.dataTransfer.dropEffect = 'move';
    }
  }, [dragState])

  const itemDropHandler = useCallback((_evt: DragEvent<HTMLElement>, itemId: number) => {
    const list = getToDoList();
    if (!list || !dragState?.draggingItemId) {
      return;
    }
    const { draggingItemId } = dragState;
    const sourceIdx = list.items.findIndex(item => item.id === draggingItemId);
    const targetIdx = list.items.findIndex(item => item.id === itemId);
    if (sourceIdx !== -1 && targetIdx !== -1) {
      setToDoListAndSave({
        ...list,
        items: moveItemInList(list.items, sourceIdx, targetIdx)
      })
    }
  }, [dragState, getToDoList, setToDoListAndSave])

  const doneCount = toDoList ? toDoList.items.filter(item => item.isDone).length : 0;
  const totalCount = toDoList ? toDoList.items.length : 0;

  return (
    toDoList
    ? <div className={styles['todo-list-widget']}>
      <div className={styles['todo-list-viewport']} data-widget-context="">
        {activeItemEditorState?.id==='add-top' && <input
          type="text"
          placeholder="Add an item"
          aria-label="Add an item"
          ref={addItemTopInputRef}
          className={clsx(styles['todo-list-item-editor'], styles['todo-list-add-item-editor'])}
          onBlur={e=>addItemInputBlurHandler(e, true)}
          onKeyDown={e=>addItemInputKeyDownHandler(e, true)}
          maxLength={maxTextLength}
        />}
        <ul
          className={clsx(styles['todo-list'], dragState && styles['is-drag-state'])}
        >
          {toDoList.items.map(item=>(
            <li
              key={item.id}
              className={clsx(styles['todo-list-item'], item.isDone && styles['is-done'], activeItemEditorState?.id === item.id && styles['is-editor'], dragState?.draggingOverItemId===item.id && styles['is-drop-area'])}
              data-widget-context={item.id}
              draggable={true}
              onDragStart={e=>itemDragStartHandler(e, item.id)}
              onDragEnd={e=>itemDragEndHandler(e, item.id)}
              onDragEnter={e=>itemDragEnterHandler(e, item.id)}
              onDragLeave={e=>itemDragLeaveHandler(e, item.id)}
              onDragOver={e=>itemDragOverHandler(e, item.id)}
              onDrop={e=>itemDropHandler(e, item.id)}
            >
              <label title={item.text}>
                <span>
                  <input
                    type='checkbox'
                    checked={item.isDone}
                    onChange={_ => setItemDone(item.id, !item.isDone)}/>
                </span>
                {activeItemEditorState?.id === item.id
                  ? <input
                      type="text"
                      ref={editItemInputRef}
                      className={clsx(styles['todo-list-item-editor'], styles['todo-list-edit-item-editor'])}
                      aria-label="Edit item"
                      onBlur={e => editItemInputBlurHandler(e, item.id)}
                      onKeyDown={e => editItemInputKeyDownHandler(e, item.id)}
                      defaultValue={item.text}
                      maxLength={maxTextLength}
                    />
                  : <span>{item.text}</span>
                }
              </label>
              {item.isDone &&
                <ActionBar
                  actionBarItems={createDoneActionBarItems(item.id)}
                  className={styles['done-item-actionbar']}
                  ariaLabel={`${item.text.trim().slice(0, 40) || 'Item'} actions`}
                ></ActionBar>
              }
            </li>
          ))}
        </ul>
        <input
          type="text"
          placeholder="Add an item"
          aria-label="Add an item"
          ref={addItemBottomInputRef}
          className={clsx(styles['todo-list-item-editor'], styles['todo-list-add-item-editor'])}
          onBlur={e=>addItemInputBlurHandler(e, false)}
          onKeyDown={e=>addItemInputKeyDownHandler(e, false)}
          maxLength={maxTextLength}
        />
      </div>
      <div className={styles['todo-list-count']}>
        {totalCount === 0 ? 'No items' : `${doneCount} / ${totalCount} done`}
      </div>
    </div>
    : <>{loadFailed ? 'Unable to load to-do list. Restart the app to retry.' : 'Loading To-Do List...'}</>
  )
}

function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  // Remount when the implicit sync scope changes (widget moved between
  // projects, or between shelf and a workflow) so the initial load reads
  // from the new storage bucket.
  return <ToDoInner key={scopeForEnv(props.env)} {...props} />;
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
