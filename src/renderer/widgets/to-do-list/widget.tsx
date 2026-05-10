/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBar, ActionBarItems, ReactComponent, WidgetReactComponentProps, delete14Svg, moveItemInList } from '@/widgets/appModules';
import * as styles from './widget.module.scss';
import { Settings } from './settings';
import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createContextMenuFactory } from '@/widgets/to-do-list/contextMenu';
import { createActionBarItems } from '@/widgets/to-do-list/actionBar';
import clsx from 'clsx';
import { addItem, deleteItem, editItem, markComplete, markIncomplete } from '@/widgets/to-do-list/actions';
import { ActiveItemEditorState, ToDoListState, maxTextLength, sanitizeLoadedToDoListState } from '@/widgets/to-do-list/state';
import { focusItemInput, scrollToItemInput, selectAllInItemInput } from '@/widgets/to-do-list/dom';
import { getOrCreateTodoListSaver, getTodoListState, setTodoListState, useTodoListState } from '@/widgets/to-do-list/todoStore';

const dataKey = 'todo';

function scopeForEnv(env: WidgetReactComponentProps<Settings>['env']): string {
  return env.area === 'workflow' ? env.projectId : 'app';
}

function ToDoInner({widgetApi, settings, env}: WidgetReactComponentProps<Settings>) {
  const scope = scopeForEnv(env);
  const addItemTopInputRef = useRef<HTMLInputElement>(null);
  const addItemBottomInputRef = useRef<HTMLInputElement>(null);
  const editItemInputRef = useRef<HTMLInputElement>(null);
  const {updateActionBar, setContextMenuFactory, dataStorage} = widgetApi;
  // Shared in-memory store — sibling widgets in the same scope subscribe to
  // the same map entry, so any setState() reaches them synchronously without
  // an IPC roundtrip. Disk persistence still happens via debounced setJson.
  const { state: toDoList, setState: setStoreToDoList } = useTodoListState(scope);
  const [activeItemEditorState, setActiveItemEditorState] = useState<ActiveItemEditorState>(null);
  const [dragState, setDragState] = useState<{
    draggingItemId: number | null;
    draggingOverItemId: number | null;
  } | null>(null);


  // Safe under the contract that getToDoList is only invoked from handlers
  // mounted under the `toDoList ?` JSX gate or from effects that early-out
  // when toDoList is undefined.
  const getToDoList = useCallback(() => toDoList!, [toDoList]);

  // Shorter debounce than typical text widgets: to-do actions (checkbox toggle,
  // item add/delete/reorder) are discrete operations where a fast propagation
  // matters more than coalescing a stream of keystrokes. The saver is per-scope
  // (not per-widget), so two siblings editing in quick succession produce one
  // disk write of the latest state instead of two races. The returned saver has
  // stable identity per scope, so no `useMemo` is needed.
  const saveData = getOrCreateTodoListSaver(scope, (data) => dataStorage.setJson(dataKey, data));

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
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, dataStorage, toDoList]);

  const setToDoListAndSave = useCallback((next: ToDoListState) => {
    setStoreToDoList(next);
    saveData(next);
  }, [saveData, setStoreToDoList])

  useEffect(() => {
    if (toDoList) {
      updateActionBar(createActionBarItems(getToDoList, setToDoListAndSave, setActiveItemEditorState));
    }
  }, [getToDoList, toDoList, setToDoListAndSave, updateActionBar]);

  useEffect(() => {
    if (toDoList) {
      setContextMenuFactory(
        createContextMenuFactory(settings, getToDoList, setToDoListAndSave, setActiveItemEditorState)
        );
    }
  }, [getToDoList, toDoList, setContextMenuFactory, setToDoListAndSave, settings]);

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
    if (!toDoList || !dragState?.draggingItemId) {
      return;
    }
    const { draggingItemId } = dragState;
    const sourceIdx = toDoList.items.findIndex(item => item.id === draggingItemId);
    const targetIdx = toDoList.items.findIndex(item => item.id === itemId);
    if (sourceIdx !== -1 && targetIdx !== -1) {
      setToDoListAndSave({
        ...toDoList,
        items: moveItemInList(toDoList.items, sourceIdx, targetIdx)
      })
    }
  }, [dragState, toDoList, setToDoListAndSave])

  return (
    toDoList
    ? <div className={styles['todo-list-viewport']} data-widget-context="">
        {activeItemEditorState?.id==='add-top' && <input
          type="text"
          placeholder="Add an item"
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
                    onChange={
                      _ => item.isDone
                        ? markIncomplete(item.id, getToDoList, setToDoListAndSave)
                        : markComplete(item.id, settings.doneToBottom, getToDoList, setToDoListAndSave)
                    }/>
                </span>
                {activeItemEditorState?.id === item.id
                  ? <input
                      type="text"
                      ref={editItemInputRef}
                      className={clsx(styles['todo-list-item-editor'], styles['todo-list-edit-item-editor'])}
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
                ></ActionBar>
              }
            </li>
          ))}
        </ul>
        <input
          type="text"
          placeholder="Add an item"
          ref={addItemBottomInputRef}
          className={clsx(styles['todo-list-item-editor'], styles['todo-list-add-item-editor'])}
          onBlur={e=>addItemInputBlurHandler(e, false)}
          onKeyDown={e=>addItemInputKeyDownHandler(e, false)}
          maxLength={maxTextLength}
        />
      </div>
    : <>Loading To-Do List...</>
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
