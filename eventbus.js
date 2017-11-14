// ES6 port of Backbone.Event

import _ from 'underscore';

// Regular expression used to split event strings.
const eventSplitter = /\s+/;

// Iterates over the standard `event, callback` (as well as the fancy multiple
// space-separated events `"change blur", callback` and jQuery-style event
// maps `{event: callback}`).
function eventsApi(iteratee, evts, name, callback, options) {
  let i = 0;
  let names;
  let events = evts;
  const opts = options;
  if (name && typeof name === 'object') {
    // Handle event maps.
    if (callback !== undefined && 'context' in opts && opts.context === undefined) opts.context = callback;
    for (names = _.keys(name); i < names.length; i += 1) {
      events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
    }
  } else if (name && eventSplitter.test(name)) {
    // Handle space-separated event names by delegating them individually.
    for (names = name.split(eventSplitter); i < names.length; i += 1) {
      events = iteratee(events, names[i], callback, opts);
    }
  } else {
    // Finally, standard events.
    events = iteratee(events, name, callback, opts);
  }
  return events;
}


// The reducing API that adds a callback to the `events` object.
function onApi(evts, name, callback, options) {
  const events = evts;
  if (callback) {
    const handlers = events[name] || (events[name] = []);
    const { context, ctx, listening } = options;
    if (listening) listening.count += 1;
    handlers.push({
      callback,
      context,
      listening,
      ctx: context || ctx,
    });
  }
  return events;
}

// Guard the `listening` argument from the public API.
function internalOn(object, name, callback, context, listening) {
  const obj = object;
  obj._events = eventsApi(onApi, obj._events || {}, name, callback, {
    context,
    listening,
    ctx: obj,
  });

  if (listening) {
    const listeners = obj._listeners || (obj._listeners = {});
    listeners[listening.id] = listening;
  }

  return obj;
}

// The reducing API that removes a callback from the `events` object.
function offApi(evts, name, callback, options) {
  if (!evts) return undefined;

  let i = 0;
  let listening;
  const events = evts;
  const { context, listeners } = options;

  // Delete all events listeners and "drop" events.
  if (!name && !callback && !context) {
    const ids = _.keys(listeners);
    for (; i < ids.length; i += 1) {
      listening = listeners[ids[i]];
      delete listeners[listening.id];
      delete listening.listeningTo[listening.objId];
    }
    return undefined;
  }

  const names = name ? [name] : _.keys(events);
  for (; i < names.length; i += 1) {
    const handlers = events[names[i]];

    // Bail out if there are no events stored.
    if (!handlers) break;

    // Replace events if there are any remaining.  Otherwise, clean up.
    const remaining = [];
    for (let j = 0; j < handlers.length; j += 1) {
      const handler = handlers[j];
      if (
        (callback && callback !== handler.callback &&
          callback !== handler.callback._callback) ||
            (context && context !== handler.context)
      ) {
        remaining.push(handler);
      } else if (handler.listening) {
        handler.listening.count -= 1;
        if (handler.listening.count === 0) {
          delete listeners[handler.listening.id];
          delete handler.listening.listeningTo[handler.listening.objId];
        }
      }
    }

    // Update tail event if the list has any events.  Otherwise, clean up.
    if (remaining.length) {
      events[names[i]] = remaining;
    } else {
      delete events[names[i]];
    }
  }
  return events;
}

// Reduces the event callbacks into a map of `{event: onceWrapper}`.
// `offer` unbinds the `onceWrapper` after it has been called.
function onceMap(map, name, callback, offer) {
  if (callback) {
    const m = map;
    const once = _.once((...args) => {
      offer(name, once);
      callback.apply(this, args);
    });
    m[name] = once;
    once._callback = callback;
  }
  return map;
}

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Backbone events have 3 arguments).
function triggerEvents(events, args) {
  let ev;
  let i = 0;
  const l = events.length;
  const a1 = args[0];
  const a2 = args[1];
  const a3 = args[2];
  switch (args.length) {
    case 0:
      while (i < l) {
        ev = events[i];
        ev.callback.call(ev.ctx);
        i += 1;
      }
      return;
    case 1:
      while (i < l) {
        ev = events[i];
        ev.callback.call(ev.ctx, a1);
        i += 1;
      }
      return;
    case 2:
      while (i < l) {
        ev = events[i];
        ev.callback.call(ev.ctx, a1, a2);
        i += 1;
      }
      return;
    case 3:
      while (i < l) {
        ev = events[i];
        ev.callback.call(ev.ctx, a1, a2, a3);
        i += 1;
      }
      return;
    default:
      while (i < l) {
        ev = events[i];
        ev.callback.call(ev.ctx, args);
        i += 1;
      }
  }
}

// Handles triggering the appropriate event callbacks.
function triggerApi(objEvents, name, callback, args) {
  if (objEvents) {
    const events = objEvents[name];
    let allEvents = objEvents.all;
    if (events && allEvents) allEvents = allEvents.slice();
    if (events) triggerEvents(events, args);
    if (allEvents) triggerEvents(allEvents, [name].concat(args));
  }
  return objEvents;
}


/**
 *
*
 * Event bus implementation extracted from Backbone.js v1.3.3
 *
 *
 */
class EventBus {
  constructor() {
    this.on = _.bind(this.on, this);
    this.off = _.bind(this.off, this);
    this.trigger = _.bind(this.trigger, this);
    this.listenTo = _.bind(this.listenTo, this);
    this.stopListening = _.bind(this.stopListening, this);
    this.once = _.bind(this.once, this);
    this.listenToOnce = _.bind(this.listenToOnce, this);
  }

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
  on(name, callback, context) {
    return internalOn(this, name, callback, context);
  }

  // Remove one or many callbacks. If `context` is null, removes all
  // callbacks with that function. If `callback` is null, removes all
  // callbacks for the event. If `name` is null, removes all bound
  // callbacks for all events.
  off(name, callback, context) {
    if (!this._events) return this;
    this._events = eventsApi(offApi, this._events, name, callback, {
      context,
      listeners: this._listeners,
    });
    return this;
  }

  // Trigger one or many events, firing all bound callbacks. Callbacks are
  // passed the same arguments as `trigger` is, apart from the event name
  // (unless you're listening on `"all"`, which will cause your callback to
  // receive the true name of the event as the first argument).
  trigger(...args) {
    if (!this._events) return this;

    const name = args[0];
    const length = Math.max(0, args.length - 1);
    const argsParam = Array(length);
    for (let i = 0; i < length; i += 1) argsParam[i] = args[i + 1];

    eventsApi(triggerApi, this._events, name, undefined, argsParam);
    return this;
  }

  // Inversion-of-control versions of `on`. Tell *this* object to listen to
  // an event in another object... keeping track of what it's listening to
  // for easier unbinding later.
  listenTo(object, name, callback) {
    if (!object) return this;
    const obj = object;
    const id = obj._listenId || (obj._listenId = _.uniqueId('l'));
    const listeningTo = this._listeningTo || (this._listeningTo = {});
    let listening = listeningTo[id];

    // This object is not listening to any other events on `obj` yet.
    // Setup the necessary references to track the listening callbacks.
    if (!listening) {
      const thisId = this._listenId || (this._listenId = _.uniqueId('l'));
      listeningTo[id] = {
        obj,
        listeningTo,
        objId: id,
        id: thisId,
        count: 0,
      };
      listening = listeningTo[id];
    }

    // Bind callbacks on obj, and keep track of them on listening.
    internalOn(obj, name, callback, this, listening);
    return this;
  }

  // Tell this object to stop listening to either specific events ... or
  // to every object it's currently listening to.
  stopListening(obj, name, callback) {
    const listeningTo = this._listeningTo;
    if (!listeningTo) return this;

    const ids = obj ? [obj._listenId] : _.keys(listeningTo);

    for (let i = 0; i < ids.length; i += 1) {
      const listening = listeningTo[ids[i]];

      // If listening doesn't exist, this object is not currently
      // listening to obj. Break out early.
      if (!listening) break;

      listening.obj.off(name, callback, this);
    }

    return this;
  }

  // Bind an event to only be triggered a single time. After the first time
  // the callback is invoked, its listener will be removed. If multiple events
  // are passed in using the space-separated syntax, the handler will fire
  // once for each event, not once for a combination of all events.
  once(name, cb, context) {
    // Map the event into a `{event: once}` object.
    let callback = cb;
    const events = eventsApi(onceMap, {}, name, callback, _.bind(this.off, this));
    if (typeof name === 'string' && context == null) callback = undefined;
    return this.on(events, callback, context);
  }

  // Inversion-of-control versions of `once`.
  listenToOnce(obj, name, callback) {
    // Map the event into a `{event: once}` object.
    const events = eventsApi(onceMap, {}, name, callback, _.bind(this.stopListening, this, obj));
    return this.listenTo(obj, events);
  }
}

export default EventBus;
