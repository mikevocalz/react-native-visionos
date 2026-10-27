/**
 * @format
 * @flow strict
 * @jsdoc
 */

import NativeWindowManager from './NativeWindowManager';

const WindowManager = {
  getWindow: function (id: string): Window {
    return new Window(id);
  },

  // $FlowFixMe[unsafe-getters-setters]
  get supportsMultipleScenes(): boolean {
    if (NativeWindowManager == null) {
      return false;
    }

    const nativeConstants = NativeWindowManager.getConstants();
    return nativeConstants.supportsMultipleScenes || false;
  },
};

class Window {
  id: string;

  constructor(id: string) {
    this.id = id;
  }

  // $FlowFixMe[unclear-type]
  open(props: ?Object): Promise<void> {
    if (NativeWindowManager != null && NativeWindowManager.openWindow != null) {
      return NativeWindowManager.openWindow(this.id, props);
    }
    return Promise.reject(new Error('NativeWindowManager is not available'));
  }

  // $FlowFixMe[unclear-type]
  close(): Promise<void> {
    if (
      NativeWindowManager != null &&
      NativeWindowManager.closeWindow != null
    ) {
      return NativeWindowManager.closeWindow(this.id);
    }
    return Promise.reject(new Error('NativeWindowManager is not available'));
  }

  // $FlowFixMe[unclear-type]
  update(props: ?Object): Promise<void> {
    if (
      NativeWindowManager != null &&
      NativeWindowManager.updateWindow != null
    ) {
      return NativeWindowManager.updateWindow(this.id, props);
    }
    return Promise.reject(new Error('NativeWindowManager is not available'));
  }
}

export default WindowManager;
