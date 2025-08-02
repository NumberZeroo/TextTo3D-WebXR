/* ========================================================================== */
/*  File: src/state.js                                                       */
/* ========================================================================== */
import mitt from 'mitt';

const emitter = mitt();
const state = { typedText: '' };

export default {
  get: (key) => state[key],
  set: (key, value) => {
    state[key] = value;
    emitter.emit(key, value);
  },
  on: emitter.on,
  emit: emitter.emit,
};
