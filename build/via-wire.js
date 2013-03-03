
/** @license MIT License (c) copyright 2011-2013 original author or authors */

/**
 * A lightweight CommonJS Promises/A and when() implementation
 * when is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author Brian Cavalier
 * @author John Hann
 *
 * @version 1.8.1
 */

(function(define) { 
define('when/when',[],function () {
	var reduceArray, slice, undef;

	//
	// Public API
	//

	when.defer     = defer;     // Create a deferred
	when.resolve   = resolve;   // Create a resolved promise
	when.reject    = reject;    // Create a rejected promise

	when.join      = join;      // Join 2 or more promises

	when.all       = all;       // Resolve a list of promises
	when.map       = map;       // Array.map() for promises
	when.reduce    = reduce;    // Array.reduce() for promises

	when.any       = any;       // One-winner race
	when.some      = some;      // Multi-winner race

	when.chain     = chain;     // Make a promise trigger another resolver

	when.isPromise = isPromise; // Determine if a thing is a promise

	/**
	 * Register an observer for a promise or immediate value.
	 *
	 * @param {*} promiseOrValue
	 * @param {function?} [onFulfilled] callback to be called when promiseOrValue is
	 *   successfully fulfilled.  If promiseOrValue is an immediate value, callback
	 *   will be invoked immediately.
	 * @param {function?} [onRejected] callback to be called when promiseOrValue is
	 *   rejected.
	 * @param {function?} [onProgress] callback to be called when progress updates
	 *   are issued for promiseOrValue.
	 * @returns {Promise} a new {@link Promise} that will complete with the return
	 *   value of callback or errback or the completion value of promiseOrValue if
	 *   callback and/or errback is not supplied.
	 */
	function when(promiseOrValue, onFulfilled, onRejected, onProgress) {
		// Get a trusted promise for the input promiseOrValue, and then
		// register promise handlers
		return resolve(promiseOrValue).then(onFulfilled, onRejected, onProgress);
	}

	/**
	 * Returns promiseOrValue if promiseOrValue is a {@link Promise}, a new Promise if
	 * promiseOrValue is a foreign promise, or a new, already-fulfilled {@link Promise}
	 * whose value is promiseOrValue if promiseOrValue is an immediate value.
	 *
	 * @param {*} promiseOrValue
	 * @returns {Promise} Guaranteed to return a trusted Promise.  If promiseOrValue
	 *   is trusted, returns promiseOrValue, otherwise, returns a new, already-resolved
	 *   when.js promise whose resolution value is:
	 *   * the resolution value of promiseOrValue if it's a foreign promise, or
	 *   * promiseOrValue if it's a value
	 */
	function resolve(promiseOrValue) {
		var promise;

		if(promiseOrValue instanceof Promise) {
			// It's a when.js promise, so we trust it
			promise = promiseOrValue;

		} else if(isPromise(promiseOrValue)) {
			// Assimilate foreign promises
			promise = assimilate(promiseOrValue);
		} else {
			// It's a value, create a fulfilled promise for it.
			promise = fulfilled(promiseOrValue);
		}

		return promise;
	}

	/**
	 * Assimilate an untrusted thenable by introducing a trusted middle man.
	 * Not a perfect strategy, but possibly the best we can do.
	 * IMPORTANT: This is the only place when.js should ever call an untrusted
	 * thenable's then() on an. Don't expose the return value to the untrusted thenable
	 *
	 * @param {*} thenable
	 * @param {function} thenable.then
	 * @returns {Promise}
	 */
	function assimilate(thenable) {
		var d = defer();

		// TODO: Enqueue this for future execution in 2.0
		try {
			thenable.then(
				function(value)  { d.resolve(value); },
				function(reason) { d.reject(reason); },
				function(update) { d.progress(update); }
			);
		} catch(e) {
			d.reject(e);
		}

		return d.promise;
	}

	/**
	 * Returns a rejected promise for the supplied promiseOrValue.  The returned
	 * promise will be rejected with:
	 * - promiseOrValue, if it is a value, or
	 * - if promiseOrValue is a promise
	 *   - promiseOrValue's value after it is fulfilled
	 *   - promiseOrValue's reason after it is rejected
	 * @param {*} promiseOrValue the rejected value of the returned {@link Promise}
	 * @return {Promise} rejected {@link Promise}
	 */
	function reject(promiseOrValue) {
		return when(promiseOrValue, rejected);
	}

	/**
	 * Trusted Promise constructor.  A Promise created from this constructor is
	 * a trusted when.js promise.  Any other duck-typed promise is considered
	 * untrusted.
	 * @constructor
	 * @name Promise
	 */
	function Promise(then) {
		this.then = then;
	}

	Promise.prototype = {
		/**
		 * Register a callback that will be called when a promise is
		 * fulfilled or rejected.  Optionally also register a progress handler.
		 * Shortcut for .then(onFulfilledOrRejected, onFulfilledOrRejected, onProgress)
		 * @param {function?} [onFulfilledOrRejected]
		 * @param {function?} [onProgress]
		 * @return {Promise}
		 */
		always: function(onFulfilledOrRejected, onProgress) {
			return this.then(onFulfilledOrRejected, onFulfilledOrRejected, onProgress);
		},

		/**
		 * Register a rejection handler.  Shortcut for .then(undefined, onRejected)
		 * @param {function?} onRejected
		 * @return {Promise}
		 */
		otherwise: function(onRejected) {
			return this.then(undef, onRejected);
		},

		/**
		 * Shortcut for .then(function() { return value; })
		 * @param  {*} value
		 * @return {Promise} a promise that:
		 *  - is fulfilled if value is not a promise, or
		 *  - if value is a promise, will fulfill with its value, or reject
		 *    with its reason.
		 */
		'yield': function(value) {
			return this.then(function() {
				return value;
			});
		},

		/**
		 * Assumes that this promise will fulfill with an array, and arranges
		 * for the onFulfilled to be called with the array as its argument list
		 * i.e. onFulfilled.apply(undefined, array).
		 * @param {function} onFulfilled function to receive spread arguments
		 * @return {Promise}
		 */
		spread: function(onFulfilled) {
			return this.then(function(array) {
				// array may contain promises, so resolve its contents.
				return all(array, function(array) {
					return onFulfilled.apply(undef, array);
				});
			});
		}
	};

	/**
	 * Create an already-resolved promise for the supplied value
	 * @private
	 *
	 * @param {*} value
	 * @return {Promise} fulfilled promise
	 */
	function fulfilled(value) {
		var p = new Promise(function(onFulfilled) {
			try {
				return resolve(typeof onFulfilled == 'function' ? onFulfilled(value) : value);
			} catch(e) {
				return rejected(e);
			}
		});

		return p;
	}

	/**
	 * Create an already-rejected {@link Promise} with the supplied
	 * rejection reason.
	 * @private
	 *
	 * @param {*} reason
	 * @return {Promise} rejected promise
	 */
	function rejected(reason) {
		var p = new Promise(function(_, onRejected) {
			try {
				return resolve(typeof onRejected == 'function' ? onRejected(reason) : rejected(reason));
			} catch(e) {
				return rejected(e);
			}
		});

		return p;
	}

	/**
	 * Creates a new, Deferred with fully isolated resolver and promise parts,
	 * either or both of which may be given out safely to consumers.
	 * The Deferred itself has the full API: resolve, reject, progress, and
	 * then. The resolver has resolve, reject, and progress.  The promise
	 * only has then.
	 *
	 * @return {Deferred}
	 */
	function defer() {
		var deferred, promise, handlers, progressHandlers,
			_then, _notify, _resolve;

		/**
		 * The promise for the new deferred
		 * @type {Promise}
		 */
		promise = new Promise(then);

		/**
		 * The full Deferred object, with {@link Promise} and {@link Resolver} parts
		 * @class Deferred
		 * @name Deferred
		 */
		deferred = {
			then:     then, // DEPRECATED: use deferred.promise.then
			resolve:  promiseResolve,
			reject:   promiseReject,
			progress: promiseNotify, // DEPRECATED: use deferred.notify
			notify:   promiseNotify,

			promise:  promise,

			resolver: {
				resolve:  promiseResolve,
				reject:   promiseReject,
				progress: promiseNotify, // DEPRECATED: use deferred.notify
				notify:   promiseNotify
			}
		};

		handlers = [];
		progressHandlers = [];

		/**
		 * Pre-resolution then() that adds the supplied callback, errback, and progback
		 * functions to the registered listeners
		 * @private
		 *
		 * @param {function?} [onFulfilled] resolution handler
		 * @param {function?} [onRejected] rejection handler
		 * @param {function?} [onProgress] progress handler
		 */
		_then = function(onFulfilled, onRejected, onProgress) {
			var deferred, progressHandler;

			deferred = defer();

			progressHandler = typeof onProgress === 'function'
				? function(update) {
					try {
						// Allow progress handler to transform progress event
						deferred.notify(onProgress(update));
					} catch(e) {
						// Use caught value as progress
						deferred.notify(e);
					}
				}
				: function(update) { deferred.notify(update); };

			handlers.push(function(promise) {
				promise.then(onFulfilled, onRejected)
					.then(deferred.resolve, deferred.reject, progressHandler);
			});

			progressHandlers.push(progressHandler);

			return deferred.promise;
		};

		/**
		 * Issue a progress event, notifying all progress listeners
		 * @private
		 * @param {*} update progress event payload to pass to all listeners
		 */
		_notify = function(update) {
			processQueue(progressHandlers, update);
			return update;
		};

		/**
		 * Transition from pre-resolution state to post-resolution state, notifying
		 * all listeners of the resolution or rejection
		 * @private
		 * @param {*} value the value of this deferred
		 */
		_resolve = function(value) {
			// Replace _then with one that directly notifies with the result.
			_then = value.then;
			// Replace _resolve so that this Deferred can only be resolved once
			_resolve = resolve;
			// Make _progress a noop, to disallow progress for the resolved promise.
			_notify = identity;

			// Notify handlers
			processQueue(handlers, value);

			// Free progressHandlers array since we'll never issue progress events
			progressHandlers = handlers = undef;

			return value;
		};

		return deferred;

		/**
		 * Wrapper to allow _then to be replaced safely
		 * @param {function?} [onFulfilled] resolution handler
		 * @param {function?} [onRejected] rejection handler
		 * @param {function?} [onProgress] progress handler
		 * @return {Promise} new promise
		 */
		function then(onFulfilled, onRejected, onProgress) {
			// TODO: Promises/A+ check typeof onFulfilled, onRejected, onProgress
			return _then(onFulfilled, onRejected, onProgress);
		}

		/**
		 * Wrapper to allow _resolve to be replaced
		 */
		function promiseResolve(val) {
			return _resolve(resolve(val));
		}

		/**
		 * Wrapper to allow _reject to be replaced
		 */
		function promiseReject(err) {
			return _resolve(rejected(err));
		}

		/**
		 * Wrapper to allow _notify to be replaced
		 */
		function promiseNotify(update) {
			return _notify(update);
		}
	}

	/**
	 * Determines if promiseOrValue is a promise or not.  Uses the feature
	 * test from http://wiki.commonjs.org/wiki/Promises/A to determine if
	 * promiseOrValue is a promise.
	 *
	 * @param {*} promiseOrValue anything
	 * @returns {boolean} true if promiseOrValue is a {@link Promise}
	 */
	function isPromise(promiseOrValue) {
		return promiseOrValue && typeof promiseOrValue.then === 'function';
	}

	/**
	 * Initiates a competitive race, returning a promise that will resolve when
	 * howMany of the supplied promisesOrValues have resolved, or will reject when
	 * it becomes impossible for howMany to resolve, for example, when
	 * (promisesOrValues.length - howMany) + 1 input promises reject.
	 *
	 * @param {Array} promisesOrValues array of anything, may contain a mix
	 *      of promises and values
	 * @param howMany {number} number of promisesOrValues to resolve
	 * @param {function?} [onFulfilled] resolution handler
	 * @param {function?} [onRejected] rejection handler
	 * @param {function?} [onProgress] progress handler
	 * @returns {Promise} promise that will resolve to an array of howMany values that
	 * resolved first, or will reject with an array of (promisesOrValues.length - howMany) + 1
	 * rejection reasons.
	 */
	function some(promisesOrValues, howMany, onFulfilled, onRejected, onProgress) {

		checkCallbacks(2, arguments);

		return when(promisesOrValues, function(promisesOrValues) {

			var toResolve, toReject, values, reasons, deferred, fulfillOne, rejectOne, notify, len, i;

			len = promisesOrValues.length >>> 0;

			toResolve = Math.max(0, Math.min(howMany, len));
			values = [];

			toReject = (len - toResolve) + 1;
			reasons = [];

			deferred = defer();

			// No items in the input, resolve immediately
			if (!toResolve) {
				deferred.resolve(values);

			} else {
				notify = deferred.notify;

				rejectOne = function(reason) {
					reasons.push(reason);
					if(!--toReject) {
						fulfillOne = rejectOne = noop;
						deferred.reject(reasons);
					}
				};

				fulfillOne = function(val) {
					// This orders the values based on promise resolution order
					// Another strategy would be to use the original position of
					// the corresponding promise.
					values.push(val);

					if (!--toResolve) {
						fulfillOne = rejectOne = noop;
						deferred.resolve(values);
					}
				};

				for(i = 0; i < len; ++i) {
					if(i in promisesOrValues) {
						when(promisesOrValues[i], fulfiller, rejecter, notify);
					}
				}
			}

			return deferred.promise.then(onFulfilled, onRejected, onProgress);

			function rejecter(reason) {
				rejectOne(reason);
			}

			function fulfiller(val) {
				fulfillOne(val);
			}

		});
	}

	/**
	 * Initiates a competitive race, returning a promise that will resolve when
	 * any one of the supplied promisesOrValues has resolved or will reject when
	 * *all* promisesOrValues have rejected.
	 *
	 * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function?} [onFulfilled] resolution handler
	 * @param {function?} [onRejected] rejection handler
	 * @param {function?} [onProgress] progress handler
	 * @returns {Promise} promise that will resolve to the value that resolved first, or
	 * will reject with an array of all rejected inputs.
	 */
	function any(promisesOrValues, onFulfilled, onRejected, onProgress) {

		function unwrapSingleResult(val) {
			return onFulfilled ? onFulfilled(val[0]) : val[0];
		}

		return some(promisesOrValues, 1, unwrapSingleResult, onRejected, onProgress);
	}

	/**
	 * Return a promise that will resolve only once all the supplied promisesOrValues
	 * have resolved. The resolution value of the returned promise will be an array
	 * containing the resolution values of each of the promisesOrValues.
	 * @memberOf when
	 *
	 * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function?} [onFulfilled] resolution handler
	 * @param {function?} [onRejected] rejection handler
	 * @param {function?} [onProgress] progress handler
	 * @returns {Promise}
	 */
	function all(promisesOrValues, onFulfilled, onRejected, onProgress) {
		checkCallbacks(1, arguments);
		return map(promisesOrValues, identity).then(onFulfilled, onRejected, onProgress);
	}

	/**
	 * Joins multiple promises into a single returned promise.
	 * @return {Promise} a promise that will fulfill when *all* the input promises
	 * have fulfilled, or will reject when *any one* of the input promises rejects.
	 */
	function join(/* ...promises */) {
		return map(arguments, identity);
	}

	/**
	 * Traditional map function, similar to `Array.prototype.map()`, but allows
	 * input to contain {@link Promise}s and/or values, and mapFunc may return
	 * either a value or a {@link Promise}
	 *
	 * @param {Array|Promise} promise array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function} mapFunc mapping function mapFunc(value) which may return
	 *      either a {@link Promise} or value
	 * @returns {Promise} a {@link Promise} that will resolve to an array containing
	 *      the mapped output values.
	 */
	function map(promise, mapFunc) {
		return when(promise, function(array) {
			var results, len, toResolve, resolve, i, d;

			// Since we know the resulting length, we can preallocate the results
			// array to avoid array expansions.
			toResolve = len = array.length >>> 0;
			results = [];
			d = defer();

			if(!toResolve) {
				d.resolve(results);
			} else {

				resolve = function resolveOne(item, i) {
					when(item, mapFunc).then(function(mapped) {
						results[i] = mapped;

						if(!--toResolve) {
							d.resolve(results);
						}
					}, d.reject);
				};

				// Since mapFunc may be async, get all invocations of it into flight
				for(i = 0; i < len; i++) {
					if(i in array) {
						resolve(array[i], i);
					} else {
						--toResolve;
					}
				}

			}

			return d.promise;

		});
	}

	/**
	 * Traditional reduce function, similar to `Array.prototype.reduce()`, but
	 * input may contain promises and/or values, and reduceFunc
	 * may return either a value or a promise, *and* initialValue may
	 * be a promise for the starting value.
	 *
	 * @param {Array|Promise} promise array or promise for an array of anything,
	 *      may contain a mix of promises and values.
	 * @param {function} reduceFunc reduce function reduce(currentValue, nextValue, index, total),
	 *      where total is the total number of items being reduced, and will be the same
	 *      in each call to reduceFunc.
	 * @returns {Promise} that will resolve to the final reduced value
	 */
	function reduce(promise, reduceFunc /*, initialValue */) {
		var args = slice.call(arguments, 1);

		return when(promise, function(array) {
			var total;

			total = array.length;

			// Wrap the supplied reduceFunc with one that handles promises and then
			// delegates to the supplied.
			args[0] = function (current, val, i) {
				return when(current, function (c) {
					return when(val, function (value) {
						return reduceFunc(c, value, i, total);
					});
				});
			};

			return reduceArray.apply(array, args);
		});
	}

	/**
	 * Ensure that resolution of promiseOrValue will trigger resolver with the
	 * value or reason of promiseOrValue, or instead with resolveValue if it is provided.
	 *
	 * @param promiseOrValue
	 * @param {Object} resolver
	 * @param {function} resolver.resolve
	 * @param {function} resolver.reject
	 * @param {*} [resolveValue]
	 * @returns {Promise}
	 */
	function chain(promiseOrValue, resolver, resolveValue) {
		var useResolveValue = arguments.length > 2;

		return when(promiseOrValue,
			function(val) {
				val = useResolveValue ? resolveValue : val;
				resolver.resolve(val);
				return val;
			},
			function(reason) {
				resolver.reject(reason);
				return rejected(reason);
			},
			function(update) {
				typeof resolver.notify === 'function' && resolver.notify(update);
				return update;
			}
		);
	}

	//
	// Utility functions
	//

	/**
	 * Apply all functions in queue to value
	 * @param {Array} queue array of functions to execute
	 * @param {*} value argument passed to each function
	 */
	function processQueue(queue, value) {
		var handler, i = 0;

		while (handler = queue[i++]) {
			handler(value);
		}
	}

	/**
	 * Helper that checks arrayOfCallbacks to ensure that each element is either
	 * a function, or null or undefined.
	 * @private
	 * @param {number} start index at which to start checking items in arrayOfCallbacks
	 * @param {Array} arrayOfCallbacks array to check
	 * @throws {Error} if any element of arrayOfCallbacks is something other than
	 * a functions, null, or undefined.
	 */
	function checkCallbacks(start, arrayOfCallbacks) {
		// TODO: Promises/A+ update type checking and docs
		var arg, i = arrayOfCallbacks.length;

		while(i > start) {
			arg = arrayOfCallbacks[--i];

			if (arg != null && typeof arg != 'function') {
				throw new Error('arg '+i+' must be a function');
			}
		}
	}

	/**
	 * No-Op function used in method replacement
	 * @private
	 */
	function noop() {}

	slice = [].slice;

	// ES5 reduce implementation if native not available
	// See: http://es5.github.com/#x15.4.4.21 as there are many
	// specifics and edge cases.
	reduceArray = [].reduce ||
		function(reduceFunc /*, initialValue */) {
			/*jshint maxcomplexity: 7*/

			// ES5 dictates that reduce.length === 1

			// This implementation deviates from ES5 spec in the following ways:
			// 1. It does not check if reduceFunc is a Callable

			var arr, args, reduced, len, i;

			i = 0;
			// This generates a jshint warning, despite being valid
			// "Missing 'new' prefix when invoking a constructor."
			// See https://github.com/jshint/jshint/issues/392
			arr = Object(this);
			len = arr.length >>> 0;
			args = arguments;

			// If no initialValue, use first item of array (we know length !== 0 here)
			// and adjust i to start at second item
			if(args.length <= 1) {
				// Skip to the first real element in the array
				for(;;) {
					if(i in arr) {
						reduced = arr[i++];
						break;
					}

					// If we reached the end of the array without finding any real
					// elements, it's a TypeError
					if(++i >= len) {
						throw new TypeError();
					}
				}
			} else {
				// If initialValue provided, use it
				reduced = args[1];
			}

			// Do the actual reduce
			for(;i < len; ++i) {
				// Skip holes
				if(i in arr) {
					reduced = reduceFunc(reduced, arr[i], i, arr);
				}
			}

			return reduced;
		};

	function identity(x) {
		return x;
	}

	return when;
});
})(typeof define == 'function' && define.amd
	? define
	: function (factory) { typeof exports === 'object'
		? (module.exports = factory())
		: (this.when      = factory());
	}
	// Boilerplate for AMD, Node, and browser global
);

define('when', ['when/when'], function (main) { return main; });

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/object',[],function() {

	var emptyObject, hasOwn;

	emptyObject = {};
	hasOwn = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

	return {
		hasOwn: hasOwn,
		isObject: isObject,
		inherit: inherit,
		mixin: mixin
	};

	function isObject(it) {
		// In IE7 tos.call(null) is '[object Object]'
		// so we need to check to see if 'it' is
		// even set
		return it && Object.prototype.toString.call(it) == '[object Object]';
	}

	function inherit(parent) {
		return parent ? Object.create(parent) : {};
	}

	/**
	 * Brute force copy own properties from -> to. Effectively an
	 * ES6 Object.assign polyfill, usable with Array.prototype.reduce.
	 * @param {object} to
	 * @param {object} from
	 * @returns {object} to
	 */
	function mixin(to, from) {
		for (var name in from) {
			if (hasOwn(from, name) && !(name in emptyObject)) {
				to[name] = from[name];
			}
		}

		return to;
	}

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(); }
);
/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Loading and merging modules
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author: brian@hovercraftstudios.com
 */
(function(define) { 
define('wire/lib/loader',['require','when','./object'],function(require) {

	var when, mixin, getPlatformLoader;

	when = require('when');
	mixin = require('./object').mixin;

	// Get the platform's loader
	getPlatformLoader = typeof exports == 'object'
		? function(require) {
			return function(moduleId) {
				try {
					return when.resolve(require(moduleId));
				} catch(e) {
					return when.reject(e);
				}
			};
		}
		: function (require) {
			return function(moduleId) {
				var deferred = when.defer();
				require([moduleId], deferred.resolve, deferred.reject);
				return deferred.promise;
			};
		};

	return getModuleLoader;

	/**
	 * Create a module loader
	 * @param {Object} context
	 * @param {function} [context.moduleLoader] existing module loader from which
	 *  the new module loader will inherit, if provided.
	 * @param {Object} options
	 * @param {function} [options.require] require function with which to configure
	 *  the module loader
	 * @return {Object} module loader with load() and merge() methods
	 */
	function getModuleLoader(context, options) {
		var loadModule = options && options.require
			? getPlatformLoader(options.require)
			: context.moduleLoader || getPlatformLoader(require);

		return {
			load: loadModule,
			merge: function(specs) {
				return when(specs, function(specs) {
					return when.resolve(Array.isArray(specs)
						? mergeAll(specs, loadModule)
						: (typeof specs === 'string' ? loadModule(specs) : specs));
				});
			}
		};
	}

	function mergeAll(specs, loadModule) {
		return when.reduce(specs, function(merged, module) {
			return typeof module == 'string'
				? when(loadModule(module), function(spec) { return mixin(merged, spec); })
				: mixin(merged, module);
		}, {});
	}

});
}(typeof define === 'function' ? define : function(factory) { module.exports = factory(require); }));


/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * sequence.js
 *
 * Run a set of task functions in sequence.  All tasks will
 * receive the same args.
 *
 * @author brian@hovercraftstudios.com
 */

(function(define) {
define('when/sequence',['./when'], function(when) {

	/**
	 * Run array of tasks in sequence with no overlap
	 * @param tasks {Array|Promise} array or promiseForArray of task functions
	 * @param [args] {*} arguments to be passed to all tasks
	 * @return {Promise} promise for an array containing
	 * the result of each task in the array position corresponding
	 * to position of the task in the tasks array
	 */
	return function sequence(tasks /*, args... */) {
		var args = Array.prototype.slice.call(arguments, 1);
		return when.reduce(tasks, function(results, task) {
			return when(task.apply(null, args), function(result) {
				results.push(result);
				return results;
			});
		}, []);
	};

});
})(typeof define == 'function' && define.amd
	? define
	: function (deps, factory) { typeof exports == 'object'
		? (module.exports = factory(require('./when')))
		: (this.when_sequence = factory(this.when));
	}
	// Boilerplate for AMD, Node, and browser global
);



/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/array',[],function() {


	var slice = [].slice;

	return {
		delegate: delegateArray,
		fromArguments: fromArguments
	};

	/**
	 * Creates a new {Array} with the same contents as array
	 * @param array {Array}
	 * @return {Array} a new {Array} with the same contents as array. If array is falsey,
	 *  returns a new empty {Array}
	 */
	function delegateArray(array) {
		return array ? [].concat(array) : [];
	}

	function fromArguments(args, index) {
		return slice.call(args, index||0);
	}

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(); }
);
/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * cancelable.js
 *
 * Decorator that makes a deferred "cancelable".  It adds a cancel() method that
 * will call a special cancel handler function and then reject the deferred.  The
 * cancel handler can be used to do resource cleanup, or anything else that should
 * be done before any other rejection handlers are executed.
 *
 * Usage:
 *
 * var cancelableDeferred = cancelable(when.defer(), myCancelHandler);
 *
 * @author brian@hovercraftstudios.com
 */

(function(define) {
define('when/cancelable',['./when'], function(when) {

    /**
     * Makes deferred cancelable, adding a cancel() method.
     *
     * @param deferred {Deferred} the {@link Deferred} to make cancelable
     * @param canceler {Function} cancel handler function to execute when this deferred is canceled.  This
     * is guaranteed to run before all other rejection handlers.  The canceler will NOT be executed if the
     * deferred is rejected in the standard way, i.e. deferred.reject().  It ONLY executes if the deferred
     * is canceled, i.e. deferred.cancel()
     *
     * @returns deferred, with an added cancel() method.
     */
    return function(deferred, canceler) {

        var delegate = when.defer();

        // Add a cancel method to the deferred to reject the delegate
        // with the special canceled indicator.
        deferred.cancel = function() {
            return delegate.reject(canceler(deferred));
        };

        // Ensure that the original resolve, reject, and progress all forward
        // to the delegate
        deferred.promise.then(delegate.resolve, delegate.reject, delegate.notify);

        // Replace deferred's promise with the delegate promise
        deferred.promise = delegate.promise;

        // Also replace deferred.then to allow it to be called safely and
        // observe the cancellation
		// TODO: Remove once deferred.then is removed
        deferred.then = delegate.promise.then;

        return deferred;
    };

});
})(typeof define == 'function'
    ? define
    : function (deps, factory) { typeof module != 'undefined'
        ? (module.exports = factory(require('./when')))
        : (this.when_cancelable = factory(this.when));
    }
    // Boilerplate for AMD, Node, and browser global
);



/** @license MIT License (c) copyright B Cavalier & J Hann */

/*global setTimeout:true*/

/**
 * delay.js
 *
 * Helper that returns a promise that resolves after a delay.
 *
 * @author brian@hovercraftstudios.com
 */

(function(define) {
define('when/delay',['./when'], function(when) {

    var undef;

    /**
     * Creates a new promise that will resolve after a msec delay.  If promise
     * is supplied, the delay will start *after* the supplied promise is resolved.
     *
     * Usage:
     * // Do something after 1 second, similar to using setTimeout
     * delay(1000).then(doSomething);
     * // or
     * when(delay(1000), doSomething);
     *
     * // Do something 1 second after triggeringPromise resolves
     * delay(triggeringPromise, 1000).then(doSomething, handleRejection);
     * // or
     * when(delay(triggeringPromise, 1000), doSomething, handleRejection);
     *
     * @param [promise] anything - any promise or value after which the delay will start
     * @param msec {Number} delay in milliseconds
     */
    return function delay(promise, msec) {
        if(arguments.length < 2) {
            msec = promise >>> 0;
            promise = undef;
        }

        var deferred = when.defer();

        setTimeout(function() {
            deferred.resolve(promise);
        }, msec);

        return deferred.promise;
    };

});
})(typeof define == 'function'
    ? define
    : function (deps, factory) { typeof module != 'undefined'
        ? (module.exports = factory(require('./when')))
        : (this.when_delay = factory(this.when));
    }
    // Boilerplate for AMD, Node, and browser global
);



/**
 * Methods for dealing with async/promises not provided directly by when.js
 * @author: brian@hovercraftstudios.com
 */
(function(define) { 
define('wire/lib/async',['require','./array','when','when/cancelable','when/delay'],function(require) {

	var array, when, cancelable, delay, undef;

	array = require('./array');
	when = require('when');
	cancelable = require('when/cancelable');
	delay = require('when/delay');

	/**
	 * Special object to hold a Promise that should not be resolved, but
	 * rather should be passed through a promise chain *as the resolution value*
	 * @param val
	 */
	function ResolvedValue(val) {
		this.value = val;
	}

	return {
		/**
		 * Create a wrapped ResolvedValue
		 * @param it
		 * @return {ResolvedValue}
		 */
		wrapValue: function(it) {
			return new ResolvedValue(it);
		},

		/**
		 * If it is a PromiseKeeper, return it.value, otherwise return it.  See
		 * PromiseKeeper above for an explanation.
		 * @param it anything
		 */
		getValue: function(it) {
			return it instanceof ResolvedValue ? it.value : it;
		},

		until: until
	};

	// TODO: Remove in favor of when/poll once it's released
	// Slightly simplified version of when/poll
	function until(work, interval, verifier) {
	
		var deferred = when.defer();

		verifier = verifier || function () { return false; };

		function schedule() {
			delay(interval).then(vote);
		}

		function vote() {
			when(work(),
				function (result) {
					when(verifier(result), handleNext, schedule);
				
					function handleNext(verification) {
						return verification ? deferred.resolve(result) : schedule();
					}
				},
				deferred.reject
			);
		}

		schedule();

		return deferred.promise;
	}

});
}(typeof define === 'function' ? define : function(factory) { module.exports = factory(require); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/lifecycle',['require','when'],function(require) {

	var when, safeNonFacetNames;

	when = require('when');
	safeNonFacetNames = {
		id: { value: 1 }
	};

	function Lifecycle(config) {
		this._config = config;
	}

	Lifecycle.prototype = {
		init: createLifecyclePhase(['create', 'configure', 'initialize']),
		startup: createLifecyclePhase(['connect', 'ready']),
		shutdown: createLifecyclePhase(['destroy'])
	};

	return Lifecycle;

	/**
	 * Generate a method to process all steps in a lifecycle phase
	 * @return {Function}
	 */
	function createLifecyclePhase(steps) {
		steps = generateSteps(steps);

		return function(proxy) {
			var self, pluginApi;

			self = this;
			pluginApi = this._config.pluginApi.contextualize(proxy.id);

			return when.reduce(steps, function (unused, step) {
				return processFacets(step, proxy, pluginApi, self._config);
			}, proxy);
		};
	}

	function processFacets(step, proxy, api, config) {
		var promises, metadata, options, name, spec, facets, safeNames, unprocessed;

		promises = [];
		metadata = proxy.metadata;
		spec = metadata.spec;
		facets = config.plugins.facets;
		safeNames = Object.create(config.plugins.factories, safeNonFacetNames);
		unprocessed = [];

		for(name in spec) {
			if(name in facets) {
				options = spec[name];
				if (options) {
					processStep(promises, facets[name], step, proxy, options, api);
				}
			} else if (metadata && !metadata.isPlugin && !(name in safeNames)) {
				unprocessed.push(name);
			}
		}

		if(unprocessed.length) {
			return when.reject(unrecognizedFacets(proxy, unprocessed, spec));
		} else {
			return when.all(promises).then(function () {
				return processListeners(step, proxy, api, config);
			}).yield(proxy);
		}
	}

	function processListeners(step, proxy, api, config) {
		var listeners, listenerPromises;

		listeners = config.plugins.listeners;
		listenerPromises = [];

		for (var i = 0; i < listeners.length; i++) {
			processStep(listenerPromises, listeners[i], step, proxy, {}, api);
		}

		return when.all(listenerPromises);
	}

	function processStep(promises, processor, step, proxy, options, api) {
		var facet, pendingFacet;

		if (processor && processor[step]) {
			pendingFacet = when.defer();
			promises.push(pendingFacet.promise);

			facet = Object.create(proxy);
			facet.options = options;
			processor[step](pendingFacet.resolver, facet, api);
		}
	}

	function generateSteps(steps) {
		return steps.reduce(reduceSteps, []);
	}

	function reduceSteps(lifecycle, step) {
		lifecycle.push(step + ':before');
		lifecycle.push(step);
		lifecycle.push(step + ':after');
		return lifecycle;
	}

	function unrecognizedFacets(proxy, unprocessed, spec) {
		return new Error('unrecognized facets in ' + proxy.id + ', maybe you forgot a plugin? ' + unprocessed.join(', ') + '\n' + JSON.stringify(spec));
	}

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(require); }
);
/** @license MIT License (c) copyright B Cavalier & J Hann */

/*global setTimeout:true, clearTimeout:true*/

/**
 * timeout.js
 *
 * Helper that returns a promise that rejects after a specified timeout,
 * if not explicitly resolved or rejected before that.
 *
 * @author brian@hovercraftstudios.com
 */

(function(define) {
define('when/timeout',['./when'], function(when) {

    var undef;

    /**
     * Returns a new promise that will automatically reject after msec if
     * the supplied promise doesn't resolve or reject before that.
     *
     * Usage:
     *
     * var d = when.defer();
     * // Setup d however you need
     *
     * // return a new promise that will timeout if d doesn't resolve/reject first
     * return timeout(d.promise, 1000);
     *
     * @param promise anything - any promise or value that should trigger
     *  the returned promise to resolve or reject before the msec timeout
     * @param msec {Number} timeout in milliseconds
     *
     * @returns {Promise}
     */
    return function timeout(promise, msec) {
        var deferred, timeoutRef;

        deferred = when.defer();

        timeoutRef = setTimeout(function onTimeout() {
            timeoutRef && deferred.reject(new Error('timed out'));
        }, msec);

        function cancelTimeout() {
            clearTimeout(timeoutRef);
            timeoutRef = undef;
        }

        when(promise,
            function(value) {
                cancelTimeout();
                deferred.resolve(value);
            },
            function(reason) {
                cancelTimeout();
                deferred.reject(reason);
            }
        );

        return deferred.promise;
    };

});
})(typeof define == 'function'
    ? define
    : function (deps, factory) { typeof module != 'undefined'
        ? (module.exports = factory(require('./when')))
        : (this.when_timeout = factory(this.when));
    }
    // Boilerplate for AMD, Node, and browser global
);



/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * DirectedGraph
 * @author: brian@hovercraftstudios.com
 */
(function(define) {
define('wire/lib/graph/DirectedGraph',[],function() {

	/**
	 * A simple directed graph
	 * @constructor
	 */
	function DirectedGraph() {
		this.vertices = {};
	}

	DirectedGraph.prototype = {
		/**
		 * Add a new edge from one vertex to another
		 * @param {string} from vertex at the tail of the edge
		 * @param {string} to vertex at the head of the edge
		 */
		addEdge: function(from, to) {
			this._getOrCreateVertex(to);
			this._getOrCreateVertex(from).edges[to] = 1;
		},

		/**
		 * Adds and initializes new vertex, or returns an existing vertex
		 * if one with the supplied name already exists
		 * @param {string} name vertex name
		 * @return {object} the new vertex, with an empty edge set
		 * @private
		 */
		_getOrCreateVertex: function(name) {
			var v = this.vertices[name];
			if(!v) {
				v = this.vertices[name] = { name: name, edges: {} };
			}

			return v;
		},

		/**
		 * Removes an edge, if it exits
		 * @param {string} from vertex at the tail of the edge
		 * @param {string} to vertex at the head of the edge
		 */
		removeEdge: function(from, to) {
			var outbound = this.vertices[from];
			if(outbound) {
				delete outbound.edges[to];
			}
		},

		/**
		 * Calls lambda once for each vertex in the graph passing
		 * the vertex as the only param.
		 * @param {function} lambda
		 */
		eachVertex: function(lambda) {
			var vertices, v;

			vertices = this.vertices;
			for(v in vertices) {
				lambda(vertices[v]);
			}
		},

		/**
		 * Calls lambda once for every outbound edge of the supplied vertex
		 * @param {string} vertex vertex name whose edges will be passed to lambda
		 * @param {function} lambda
		 */
		eachEdgeFrom: function(vertex, lambda) {
			var v, e, vertices;

			vertices = this.vertices;
			v = vertices[vertex];

			if(!v) {
				return;
			}

			for(e in v.edges) {
				lambda(v, vertices[e]);
			}
		}
	};

	return DirectedGraph;

});
}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Tarjan directed graph cycle detection
 * @author: brian@hovercraftstudios.com
 */
(function(define) {
define('wire/lib/graph/tarjan',[],function() {

	var undef;

	/**
	 * Tarjan directed graph cycle detection.
	 * See http://en.wikipedia.org/wiki/Tarjan's_strongly_connected_components_algorithm
	 *
	 * WARNING: For efficiency, this adds properties to the vertices in the
	 * graph.  It doesn't really matter for wire's internal purposes.
	 *
	 * @param {DirectedGraph} digraph
	 * @return {Array} each element is a set (Array) of vertices involved
	 * in a cycle.
	 */
	return function tarjan(digraph) {

		var index, stack, scc;

		index = 0;
		stack = [];

		scc = [];

		// Clear out any old cruft that may be hanging around
		// from a previous run.  Maybe should do this afterward?
		digraph.eachVertex(function(v) {
			delete v.index;
			delete v.lowlink;
			delete v.onStack;
		});

		// Start the depth first search
		digraph.eachVertex(function(v) {
			if(v.index === undef) {
				findStronglyConnected(digraph, v)
			}
		});

		// Tarjan algorithm for a single node
		function findStronglyConnected(dg, v) {
			var vertices, vertex;

			v.index = v.lowlink = index;
			index += 1;
			pushStack(stack, v);

			dg.eachEdgeFrom(v.name, function(v, w) {

				if(w.index === undef) {
					// Continue depth first search
					findStronglyConnected(dg, w);
					v.lowlink = Math.min(v.lowlink, w.lowlink);
				} else if(w.onStack) {
					v.lowlink = Math.min(v.lowlink, w.index);
				}

			});

			if(v.lowlink === v.index) {
				vertices = [];
				if(stack.length) {
					do {
						vertex = popStack(stack);
						vertices.push(vertex);
					} while(v !== vertex)
				}

				if(vertices.length) {
					scc.push(vertices);
				}
			}
		}

		return scc;
	};

	/**
	 * Push a vertex on the supplied stack, but also tag the
	 * vertex as being on the stack so we don't have to scan the
	 * stack later in order to tell.
	 * @param {Array} stack
	 * @param {object} vertex
	 */
	function pushStack(stack, vertex) {
		stack.push(vertex);
		vertex.onStack = 1;
	}

	/**
	 * Pop an item off the supplied stack, being sure to un-tag it
	 * @param {Array} stack
	 * @return {object|undefined} vertex
	 */
	function popStack(stack) {
		var v = stack.pop();
		if(v) {
			delete v.onStack;
		}

		return v;
	}

});
}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * formatCycles
 * @author: brian@hovercraftstudios.com
 */
(function(define) {
define('wire/lib/graph/formatCycles',[],function() {
	/**
	 * If there are cycles, format them for output
	 * @param {Array} cycles array of reference resolution cycles
	 * @return {String} formatted string
	 */
	return function formatCycles(cycles) {
		return cycles.map(function (sc) {
			return '[' + sc.map(function (v) {
					return v.name;
				}
			).join(', ') + ']';
		}).join(', ');
	}

});
}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(); }));

/**
 * trackInflightRefs
 * @author: brian@hovercraftstudios.com
 */
(function(define) {
define('wire/lib/graph/trackInflightRef',['require','when/timeout','./tarjan','./formatCycles'],function(require) {

	var timeout, findStronglyConnected, formatCycles, refCycleCheckTimeout;

	timeout = require('when/timeout');
	findStronglyConnected = require('./tarjan');
	formatCycles = require('./formatCycles');

	refCycleCheckTimeout = 5000;

	/**
	 * Add this reference to the reference graph, and setup a timeout that will fire if the refPromise
	 * has not resolved in a reasonable amount.  If the timeout fires, check the current graph for cycles
	 * and fail wiring if we find any.
	 * @param {object} refPromise promise for reference resolution
	 * @param {DirectedGraph} refGraph graph to use to track cycles
	 * @param {string} refName reference being resolved
	 * @param {string} onBehalfOf some indication of another component on whose behalf this
	 *  reference is being resolved.  Used to build a reference graph and detect cycles
	 * @return {object} promise equivalent to refPromise but that may be rejected if cycles are detected
	 */
	return function trackInflightRef(refGraph, refPromise, refName, onBehalfOf) {

		refGraph.addEdge(onBehalfOf||'?', refName);

		return timeout(refPromise, refCycleCheckTimeout).then(
			function(resolved) {
				refGraph.removeEdge(onBehalfOf||'?', refName);
				return resolved;
			},
			function() {
				var stronglyConnected, cycles;

				stronglyConnected = findStronglyConnected(refGraph);
				cycles = stronglyConnected.filter(function(node) {
					return node.length > 1;
				});

				if(cycles.length) {
					// Cycles detected
					throw new Error('Possible circular refs:\n'
						+ formatCycles(cycles));
				}

				return refPromise;
			}
		);
	}

});
}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/resolver',['require','when','when/timeout','./object','./graph/DirectedGraph','./graph/trackInflightRef'],function(require) {

	var when, timeout, object, DirectedGraph, trackInflightRef;

	when = require('when');
	timeout = require('when/timeout');
	object = require('./object');
	DirectedGraph = require('./graph/DirectedGraph');
	trackInflightRef = require('./graph/trackInflightRef');

	/**
	 * Create a reference resolve that uses the supplied plugins and pluginApi
	 * @param {object} config
	 * @param {object} config.plugins plugin registry
	 * @param {object} config.pluginApi plugin Api to provide to resolver plugins
	 *  when resolving references
	 * @constructor
	 */
	function Resolver(config) {
		this._resolvers = config.plugins.resolvers;
		this._pluginApi = config.pluginApi;

		// Directed graph to track reference cycles
		// Should be injected, but for now, we'll just create it here
		// TODO: Hoist to config or another constructor arg
		this._trackInflightRef = trackInflightRef.bind(null, new DirectedGraph());
	}

	Resolver.prototype = {

		/**
		 * Determine if it is a reference spec that can be resolved by this resolver
		 * @param {*} it
		 * @return {boolean} true iff it is a reference
		 */
		isRef: function(it) {
			return it && object.hasOwn(it, '$ref');
		},

		/**
		 * Parse it, which must be a reference spec, into a reference object
		 * @param {object|string} it
		 * @param {string?} it.$ref
		 * @return {object} reference object
		 */
		parse: function(it) {
			return this.isRef(it)
				? this.create(it.$ref, it)
				: this.create(it, {});
		},

		/**
		 * Creates a reference object
		 * @param {string} name reference name
		 * @param {object} options
		 * @return {{resolver: String, name: String, options: object, resolve: Function}}
		 */
		create: function(name, options) {
			var self, split, resolver, trackRef;

			self = this;

			split = name.indexOf('!');
			resolver = name.substring(0, split);
			name = name.substring(split + 1);
			trackRef = this._trackInflightRef;

			return {
				resolver: resolver,
				name: name,
				options: options,
				resolve: function(fallback, onBehalfOf) {
					var ref = this.resolver
						? self._resolve(resolver, name, options, onBehalfOf)
						: fallback(name, options);

					return trackRef(ref, name, onBehalfOf);
				}
			};
		},

		/**
		 * Do the work of resolving a reference using registered plugins
		 * @param {string} resolverName plugin resolver name (e.g. "dom"), the part before the "!"
		 * @param {string} name reference name, the part after the "!"
		 * @param {object} options additional options to pass thru to a resolver plugin
		 * @param {string|*} onBehalfOf some indication of another component on whose behalf this
		 *  reference is being resolved.  Used to build a reference graph and detect cycles
		 * @return {object} promise for the resolved reference
		 * @private
		 */
		_resolve: function(resolverName, name, options, onBehalfOf) {
			var deferred, resolver, api;

			deferred = when.defer();

			if (resolverName) {
				resolver = this._resolvers[resolverName];

				if (resolver) {
					api = this._pluginApi.contextualize(onBehalfOf);
					resolver(deferred.resolver, name, options||{}, api);
				} else {
					deferred.reject(new Error('No resolver plugin found: ' + resolverName));
				}

			} else {
				deferred.reject(new Error('Cannot resolve ref: ' + name));
			}

			return deferred.promise;
		}
	};

	return Resolver;

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(require); }
);
/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/proxy',['require','./object','./array'],function(require) {

	var object, array;
	
	object = require('./object');
	array = require('./array');

	/**
	 * A base proxy for all components that wire creates.  It allows wire's
	 * internals and plugins to work with components using a standard interface.
	 * WireProxy instances may be extended to specialize the behavior of the
	 * interface for a particular type of component.  For example, there is a
	 * specialized version for DOM Nodes.
	 * @param {*} target value to be proxied
	 * @param {Lifecycle} lifecycle lifecycle processor for the target component
	 * @param {Object} metadata metadata that was used to create the target component
	 *  instance being proxied
	 * @constructor
	 */
	function WireProxy(target, lifecycle, metadata) {
		this.id = metadata && metadata.id;
		this.target = target;
		this.metadata = metadata;

		Object.defineProperty(this, '_lifecycle', { value: lifecycle });
	}

	WireProxy.prototype = Object.create({
		init: function () {
			return this._lifecycle.init(this);
		},

		startup: function () {
			return this._lifecycle.startup(this);
		},

		shutdown: function () {
			return this._lifecycle.shutdown(this);
		},

		destroy: function () {}
	});

	WireProxy.prototype.get = function (property) {
		return this.target[property];
	};

	WireProxy.prototype.set = function (property, value) {
		this.target[property] = value;
		return value;
	};

	WireProxy.prototype.invoke = function (method, args) {
		var target = this.target;

		if (typeof method === 'string') {
			method = target[method];
		}

		return method.apply(target, array.fromArguments(args));
	};

	WireProxy.prototype.clone = function (options) {
		// don't try to clone a primitive
		var target = this.target;

		if (typeof target == 'function') {
			// cloneThing doesn't clone functions, so clone here:
			return target.bind();
		} else if (typeof target != 'object') {
			return target;
		}

		return cloneThing(target, options || {});
	};

	return {
		create: createProxy,
		isProxy: isProxy,
		getTarget: getTarget,
		extend: extendProxy
	};

	/**
	 * Creates a new WireProxy for the supplied target. See WireProxy
	 * @param {*} target value to be proxied
	 * @param {Lifecycle} lifecycle lifecycle processor for the target component
	 * @param {Object} metadata metadata that was used to create the target component
	 *  instance being proxied
	 * @returns {WireProxy}
	 */
	function createProxy(target, lifecycle, metadata) {
		return new WireProxy(target, lifecycle, metadata);
	}

	/**
	 * Returns a new WireProxy, whose prototype is proxy, with extensions
	 * as own properties.  This is the "official" way to extend the functionality
	 * of an existing WireProxy.
	 * @param {WireProxy} proxy proxy to extend
	 * @param extensions
	 * @returns {*}
	 */
	function extendProxy(proxy, extensions) {
		return object.mixin(Object.create(proxy), extensions);
	}

	/**
	 * Returns true if it is a WireProxy
	 * @param {*} it
	 * @returns {boolean}
	 */
	function isProxy(it) {
		return it instanceof WireProxy;
	}

	/**
	 * If it is a WireProxy (see isProxy), returns it's target.  Otherwise,
	 * returns it;
	 * @param {*} it
	 * @returns {*}
	 */
	function getTarget(it) {
		return isProxy(it) ? it.target : it;
	}

	function cloneThing (thing, options) {
		var deep, inherited, clone, prop;
		deep = options.deep;
		inherited = options.inherited;

		// Note: this filters out primitive properties and methods
		if (typeof thing != 'object') {
			return thing;
		}
		else if (thing instanceof Date) {
			return new Date(thing.getTime());
		}
		else if (thing instanceof RegExp) {
			return new RegExp(thing);
		}
		else if (Array.isArray(thing)) {
			return deep
				? thing.map(function (i) { return cloneThing(i, options); })
				: thing.slice();
		}
		else {
			clone = thing.constructor ? new thing.constructor() : {};
			for (prop in thing) {
				if (inherited || object.hasOwn(thing, prop)) {
					clone[prop] = deep
						? cloneThing(thing[prop], options)
						: thing[prop];
				}
			}
			return clone;
		}
	}

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(require); }
);
/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * plugins
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 * @author: brian@hovercraftstudios.com
 */
(function(define) {
define('wire/lib/plugin/registry',['require','when','../array','../object'],function(require) {

	var when, array, object, nsKey, nsSeparator;

	when = require('when');
	array = require('../array');
	object = require('../object');

	nsKey = '$ns';
	nsSeparator = ':';

	var registry = {
		isPlugin: isPlugin,

		scanModule: function(module, spec) {
			var self;

			if (allowPlugin(module, this.plugins)) {
				// Add to singleton plugins list to only allow one instance
				// of this plugin in the current context.
				this.plugins.push(module.wire$plugin);

				// Initialize the plugin for this context
				self = this;
				return when(module.wire$plugin(this.scopeReady, this.scopeDestroyed, spec),
					function(plugin) {
						var namespace = getNamespace(spec, self._namespaces);
						plugin && self.registerPlugin(plugin, namespace);
					}
				).yield(module);
			}

			return module;
		},

		registerPlugin: function(plugin, namespace) {
			addPlugin(plugin.resolvers, this.resolvers, namespace);
			addPlugin(plugin.factories, this.factories, namespace);
			addPlugin(plugin.facets, this.facets, namespace);

			this.listeners.push(plugin);

			this._registerProxies(plugin.proxies);
		},

		_registerProxies: function(proxiesToAdd) {
			if (!proxiesToAdd) {
				return;
			}

			var proxiers = this.proxiers;

			proxiesToAdd.forEach(function(p) {
				if (proxiers.indexOf(p) < 0) {
					proxiers.unshift(p);
				}
			});
		}
	};

	return createRegistry;

	function createRegistry(parent, ready, destroyed) {
		return Object.create(registry, {
			scopeReady: { value: ready },
			scopeDestroyed: { value: destroyed },

			plugins:   { value: [] },
			_namespaces: { value: {} },

			listeners: { value: array.delegate(parent.listeners) },
			proxiers:  { value: array.delegate(parent.proxiers) },
			resolvers: { value: object.inherit(parent.resolvers) },
			factories: { value: object.inherit(parent.factories) },
			facets:    { value: object.inherit(parent.facets) }
		});
	}

	function getNamespace(spec, namespaces) {
		var namespace;
		if(typeof spec === 'object' && nsKey in spec) {
			// A namespace was provided
			namespace = spec[nsKey];
			if(namespace && namespace in namespaces) {
				throw new Error('plugin namespace already in use: ' + namespace);
			} else {
				namespaces[namespace] = 1;
			}
		}

		return namespace;
	}

	function allowPlugin(module, existing) {
		return isPlugin(module) && existing.indexOf(module.wire$plugin) === -1;
	}

	function isPlugin(module) {
		return module && typeof module.wire$plugin == 'function'
	}

	function addPlugin(src, registry, namespace) {
		var newPluginName, namespacedName;
		for (newPluginName in src) {
			namespacedName = makeNamespace(newPluginName, namespace);
			if (object.hasOwn(registry, namespacedName)) {
				throw new Error("Two plugins for same type in scope: " + namespacedName);
			}

			registry[namespacedName] = src[newPluginName];
		}
	}

	function makeNamespace(pluginName, namespace) {
		return namespace ? (namespace + nsSeparator + pluginName) : pluginName;
	}
});
}(typeof define === 'function' ? define : function(factory) { module.exports = factory(require); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Plugin that allows wire to be used as a plugin within a wire spec
 *
 * wire is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define) {
define('wire/lib/plugin/wirePlugin',['require','when','../async','../object'],function(require) {

	var when, async, object;

	when = require('when');
	async = require('../async');
	object = require('../object');

	return {
		wire$plugin: function(ready) {

			return {
				resolvers: {
					wire: wireResolver
				},
				factories: {
					wire: wireFactory
				}
			};

			/**
			 * Factory that creates either a child context, or a *function* that will create
			 * that child context.  In the case that a child is created, this factory returns
			 * a promise that will resolve when the child has completed wiring.
			 *
			 * @param {Object} resolver used to resolve with the created component
			 * @param {Object} componentDef component spec for the component to be created
			 * @param {function} wire scoped wire function
			 */
			function wireFactory(resolver, componentDef, wire) {
				//
				// TODO: Move wireFactory to its own module
				//
				var options, module, provide, defer, waitParent, result;

				options = componentDef.options;

				// Get child spec and options
				if(options && 'spec' in options) {
					module = options.spec;
					waitParent = options.waitParent;
					defer = options.defer;
					provide = options.provide;
				} else {
					module = options;
				}

				function init(context) {
					var initialized;

					if(provide) {
						initialized = when(wire(provide), function(provides) {
							object.mixin(context.components, provides);
						});
					}

					return initialized;
				}

				function createChild(/** {Object|String}? */ mixin) {
					var spec, config;

					spec = mixin ? [].concat(module, mixin) : module;
					config = { contextHandlers: { init: init } };

					var child = wire.createChild(spec, config);
					return defer ? child
						: when(child, function(child) {
						return object.hasOwn(child, '$exports') ? child.$exports : child;
					});
				}

				if (defer) {
					// Resolve with the createChild *function* itself
					// which can be used later to wire the spec
					result = createChild;

				} else if(waitParent) {

					var childPromise = when(ready, function() {
						// ensure nothing is passed to createChild here
						return createChild();
					});

					result = async.wrapValue(childPromise);

				} else {
					result = createChild(componentDef.spec);
				}

				resolver.resolve(result);
			}
		}
	};

	/**
	 * Builtin reference resolver that resolves to the context-specific
	 * wire function.
	 */
	function wireResolver(resolver, _, __, wire) {
		resolver.resolve(wire.createChild);
	}

});
}(typeof define === 'function' ? define : function(factory) { module.exports = factory(require); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * functional
 * Helper library for working with pure functions in wire and wire plugins
 *
 * NOTE: This lib assumes Function.prototype.bind is available
 *
 * wire is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */
(function (define) { 
define('wire/lib/functional',['require','when'],function (require) {

	var when, slice;

	when = require('when');
	slice = [].slice;

	/**
	 * Create a partial function
	 * @param f {Function}
	 * @param [args] {*} additional arguments will be bound to the returned partial
	 * @return {Function}
	 */
	function partial(f, args/*...*/) {
		// What we want here is to allow the partial function to be called in
		// any context, by attaching it to an object, or using partialed.call/apply
		// That's why we're not using Function.bind() here.  It has no way to bind
		// arguments but allow the context to default.  In other words, you MUST bind
		// the the context to something with Function.bind().

		// Optimization: return f if no args provided
		if(arguments.length == 1) {
			return f;
		}

		args = slice.call(arguments, 1);

		return function() {
			return f.apply(this, args.concat(slice.call(arguments)));
		};
	}

	/**
	 * Compose functions
	 * @param funcs {Array} array of functions to compose
	 * @return {Function} composed function
	 */
	function compose(funcs) {

		var first;
		first = funcs[0];
		funcs = funcs.slice(1);

		return function composed() {
			var context = this;
			return funcs.reduce(function(result, f) {
				return conditionalWhen(result, function(result) {
					return f.call(context, result);
				});
			}, first.apply(this, arguments));
		};
	}

	/**
	 * Parses the function composition string, resolving references as needed, and
	 * composes a function from the resolved refs.
	 * @param proxy {Object} wire proxy on which to invoke the final method of the composition
	 * @param composeString {String} function composition string
	 *  of the form: 'transform1 | transform2 | ... | methodOnProxyTarget"
	 *  @param {function} wire
	 * @param {function} wire.resolveRef function to use is resolving references, returns a promise
	 * @param {function} wire.getProxy function used to obtain a proxy for a component
	 * @return {Promise} a promise for the composed function
	 */
	compose.parse = function parseCompose(proxy, composeString, wire) {

		var bindSpecs, resolveRef, getProxy;

		if(typeof composeString != 'string') {
			return wire(composeString, function(func) {
				return createProxyInvoker(proxy, func);
			});
		}

		bindSpecs = composeString.split(/\s*\|\s*/);
		resolveRef = wire.resolveRef;
		getProxy = wire.getProxy;

		function createProxyInvoker(proxy, method) {
			return function() {
				return proxy.invoke(method, arguments);
			};
		}

		function createBound(proxy, bindSpec) {
			var target, method;

			target = bindSpec.split('.');

			if(target.length > 2) {
				throw new Error('Only 1 "." is allowed in refs: ' + bindSpec);
			}

			if(target.length > 1) {
				method = target[1];
				target = target[0];
				if(!target) {
					return function(target) {
						return target[method].apply(target, slice.call(arguments, 1));
					};
				}
				return when(getProxy(target), function(proxy) {
					return createProxyInvoker(proxy, method);
				});
			} else {
				if(proxy && typeof proxy.get(bindSpec) == 'function') {
					return createProxyInvoker(proxy, bindSpec);
				} else {
					return resolveRef(bindSpec);
				}

//				return when(resolveRef(bindSpec),
//					null,
//					function() {
//						return createProxyInvoker(proxy, bindSpec);
//					}
//				);
			}

		}

		// First, resolve each transform function, stuffing it into an array
		// The result of this reduce will an array of concrete functions
		// Then add the final context[method] to the array of funcs and
		// return the composition.
		return when.reduce(bindSpecs, function(funcs, bindSpec) {
			return when(createBound(proxy, bindSpec), function(func) {
				funcs.push(func);
				return funcs;
			});
		}, []).then(
			function(funcs) {
				var context = proxy && proxy.target;
				return (funcs.length == 1 ? funcs[0] : compose(funcs)).bind(context);
			}
		);
	};

	function conditionalWhen(promiseOrValue, onFulfill, onReject) {
		return when.isPromise(promiseOrValue)
			? when(promiseOrValue, onFulfill, onReject)
			: onFulfill(promiseOrValue);
	}

	return {
		compose: compose,
		partial: partial
	};

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(require); }
);

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/component',[],function() {

	var undef;

	/**
	 * Creates an object by either invoking ctor as a function and returning the result,
	 * or by calling new ctor().  It uses a simple heuristic to try to guess which approach
	 * is the "right" one.
	 *
	 * @param ctor {Function} function or constructor to invoke
	 * @param args {Array} array of arguments to pass to ctor in either case
	 *
	 * @return The result of invoking ctor with args, with or without new, depending on
	 * the strategy selected.
	 */
	return function createComponent(ctor, args, forceConstructor) {

		var begotten, ctorResult;

		if (forceConstructor || isConstructor(ctor)) {
			begotten = Object.create(ctor.prototype);
			defineConstructorIfPossible(begotten, ctor);
			ctorResult = ctor.apply(begotten, args);
			if(ctorResult !== undef) {
				begotten = ctorResult;
			}

		} else {
			begotten = ctor.apply(undef, args);

		}

		return begotten === undef ? null : begotten;
	};

	/**
	 * Carefully sets the instance's constructor property to the supplied
	 * constructor, using Object.defineProperty if available.  If it can't
	 * set the constructor in a safe way, it will do nothing.
	 *
	 * @param instance {Object} component instance
	 * @param ctor {Function} constructor
	 */
	function defineConstructorIfPossible(instance, ctor) {
		try {
			Object.defineProperty(instance, 'constructor', {
				value: ctor,
				enumerable: false
			});
		} catch(e) {
			// If we can't define a constructor, oh well.
			// This can happen if in envs where Object.defineProperty is not
			// available, or when using cujojs/poly or other ES5 shims
		}
	}

	/**
	 * Determines whether the supplied function should be invoked directly or
	 * should be invoked using new in order to create the object to be wired.
	 *
	 * @param func {Function} determine whether this should be called using new or not
	 *
	 * @returns {Boolean} true iff func should be invoked using new, false otherwise.
	 */
	function isConstructor(func) {
		var is = false, p;
		for (p in func.prototype) {
			if (p !== undef) {
				is = true;
				break;
			}
		}

		return is;
	}

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) {
		module.exports = factory();
	}
);
(function(define) {
define('wire/lib/invoker',[],function() {

	return function(methodName, args) {
		return function(target) {
			return target[methodName].apply(target, args);
		};
	};

});
})(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(); });
/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Base wire plugin that provides properties, init, and destroy facets, and
 * a proxy for plain JS objects.
 *
 * wire is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define) { 
define('wire/lib/plugin/basePlugin',['require','when','../object','../functional','../component','../invoker'],function(require) {

	var when, object, functional, createComponent, createInvoker,
		whenAll, obj, undef;

	when = require('when');
	object = require('../object');
	functional = require('../functional');
	createComponent = require('../component');
	createInvoker = require('../invoker');

	whenAll = when.all;

	obj = {};

	function asArray(it) {
		return Array.isArray(it) ? it : [it];
	}

	function invoke(func, proxy, args, wire) {
        return when(wire(args, func, proxy.path),
			function (resolvedArgs) {
				return proxy.invoke(func, asArray(resolvedArgs));
			}
		);
	}

	function invokeAll(facet, wire) {
		var options = facet.options;

		if(typeof options == 'string') {
			return invoke(options, facet, [], wire);

		} else {
			var promises, funcName;
			promises = [];

			for(funcName in options) {
				promises.push(invoke(funcName, facet, options[funcName], wire));
			}

			return whenAll(promises);
		}
	}

	//
	// Mixins
	//

	function mixin(target, src) {
		var name, s;

		for(name in src) {
			s = src[name];
			if(!(name in target) || (target[name] !== s && (!(name in obj) || obj[name] !== s))) {
				target[name] = s;
			}
		}

		return target;
	}

	function doMixin(target, introduction, wire) {
		introduction = typeof introduction == 'string'
			? wire.resolveRef(introduction)
			: wire(introduction);

		return when(introduction, mixin.bind(null, target));
	}

	function mixinFacet(resolver, facet, wire) {
		var target, intros;

		target = facet.target;
		intros = facet.options;

		if(!Array.isArray(intros)) {
			intros = [intros];
		}

		resolver.resolve(when.reduce(intros, function(target, intro) {
			return doMixin(target, intro, wire);
		}, target));
	}

    /**
     * Factory that handles cases where you need to create an object literal
     * that has a property whose name would trigger another wire factory.
     * For example, if you need an object literal with a property named "create",
     * which would normally cause wire to try to construct an instance using
     * a constructor or other function, and will probably result in an error,
     * or an unexpected result:
     * myObject: {
     *      create: "foo"
     *    ...
     * }
     *
     * You can use the literal factory to force creation of an object literal:
     * myObject: {
     *    literal: {
     *      create: "foo"
     *    }
     * }
     *
     * which will result in myObject.create == "foo" rather than attempting
     * to create an instance of an AMD module whose id is "foo".
     */
	function literalFactory(resolver, spec /*, wire */) {
		resolver.resolve(spec.options);
	}

	/**
	 * @deprecated Use create (instanceFactory) instead
	 * @param resolver
	 * @param componentDef
	 * @param wire
	 */
	function protoFactory(resolver, componentDef, wire) {
		var parentRef, promise;

        parentRef = componentDef.options;

        promise = typeof parentRef === 'string'
                ? wire.resolveRef(parentRef)
                : wire(parentRef);

		resolver.resolve(promise.then(Object.create));
	}

	function propertiesFacet(resolver, facet, wire) {

		var properties, path, setProperty, propertiesSet;

		properties = facet.options;
		path = facet.path;
		setProperty = facet.set.bind(facet);

		propertiesSet = when.map(Object.keys(facet.options), function(key) {
			return wire(properties[key], facet.path)
				.then(function(wiredProperty) {
					setProperty(key, wiredProperty);
				}
			);
		});

		resolver.resolve(propertiesSet);
	}

	function invokerFactory(resolver, componentDef, wire) {

		var invoker = wire(componentDef.options).then(function (invokerContext) {
			// It'd be nice to use wire.getProxy() then proxy.invoke()
			// here, but that means the invoker must always return
			// a promise.  Not sure that's best, so for now, just
			// call the method directly
			return createInvoker(invokerContext.method, invokerContext.args);
		});

		resolver.resolve(invoker);
	}

	function invokerFacet(resolver, facet, wire) {
		resolver.resolve(invokeAll(facet, wire));
	}

    //noinspection JSUnusedLocalSymbols
    /**
     * Wrapper for use with when.reduce that calls the supplied destroyFunc
     * @param [unused]
     * @param destroyFunc {Function} destroy function to call
     */
    function destroyReducer(unused, destroyFunc) {
        return destroyFunc();
    }

	function cloneFactory(resolver, componentDef, wire) {
		var sourceRef, options, cloned;

		if (wire.resolver.isRef(componentDef.options.source)) {
			sourceRef = componentDef.options.source;
			options = componentDef.options;
		}
		else {
			sourceRef = componentDef.options;
			options = {};
		}

		cloned = wire(sourceRef).then(function (ref) {
			return when(wire.getProxy(ref), function (proxy) {
				if (!proxy.clone) {
					throw new Error('No clone function found for ' + componentDef.id);
				}

				return proxy.clone(options);
			});
		});

		resolver.resolve(cloned);
	}

	/**
	 * Factory that uses an AMD module either directly, or as a
	 * constructor or plain function to create the resulting item.
	 *
	 * @param {Object} resolver resolver to resolve with the created component
	 * @param {Object} componentDef portion of the spec for the component to be created
	 * @param {function} wire
	 */
	function instanceFactory(resolver, componentDef, wire) {
		var create, args, isConstructor, module, instance;

		create = componentDef.options;

		if (typeof create == 'string') {
			module = wire({ module: create });
		} else if(wire.resolver.isRef(create)) {
			module = wire(create);
		} else if(object.isObject(create) && create.module) {
			module = wire({ module: create.module });
			args = create.args ? wire(asArray(create.args)) : [];
			isConstructor = create.isConstructor;
		} else {
			module = create;
		}

		instance = when.join(module, args).spread(createInstance);

		resolver.resolve(instance);

		// Load the module, and use it to create the object
		function createInstance(module, args) {
			// We'll either use the module directly, or we need
			// to instantiate/invoke it.
			return typeof module == 'function'
				? createComponent(module, args, isConstructor)
				: Object.create(module);
		}
	}

	function composeFactory(resolver, componentDef, wire) {
		var options, promise;

		options = componentDef.options;

		if(typeof options == 'string') {
			promise = functional.compose.parse(undef, options, wire);
		} else {
			// Assume it's an array of things that will wire to functions
			promise = when(wire(options), function(funcArray) {
				return functional.compose(funcArray);
			});
		}

		resolver.resolve(promise);
	}

	return {
		wire$plugin: function(ready, destroyed /*, options */) {
            // Components in the current context that will be destroyed
            // when this context is destroyed
			var destroyFuncs, plugin;

			destroyFuncs = [];

			when(destroyed, function() {
                return when.reduce(destroyFuncs, destroyReducer, 0);
			});

			function destroyFacet(resolver, facet, wire) {
				destroyFuncs.push(function destroyObject() {
					return invokeAll(facet, wire);
				});

				// This resolver is just related to *collecting* the functions to
				// invoke when the component is destroyed.
				resolver.resolve();
			}

			plugin = {
				factories: {
					create: instanceFactory,
					literal: literalFactory,
					prototype: protoFactory,
					clone: cloneFactory,
					compose: composeFactory,
					invoker: invokerFactory
				},
				facets: {
					// properties facet.  Sets properties on components
					// after creation.
					properties: {
						configure: propertiesFacet
					},
					mixin: {
						configure: mixinFacet
					},
					// init facet.  Invokes methods on components during
					// the "init" stage.
					init: {
						initialize: invokerFacet
					},
					// ready facet.  Invokes methods on components during
					// the "ready" stage.
					ready: {
						ready: invokerFacet
					},
					// destroy facet.  Registers methods to be invoked
					// on components when the enclosing context is destroyed
					destroy: {
						ready: destroyFacet
					}
				}
			};

			// "introduce" is deprecated, but preserved here for now.
			plugin.facets.introduce = plugin.facets.mixin;

			return plugin;
		}
	};
});
})(typeof define == 'function'
	? define
	: function(factory) { module.exports = factory(require); }
);

/**
 * defaultPlugins
 * @author: brian
 */
(function(define) {
define('wire/lib/plugin/defaultPlugins',['require','./wirePlugin','./basePlugin'],function(require) {

	return [
		require('./wirePlugin'),
		require('./basePlugin')
	];

});
}(typeof define === 'function' ? define : function(factory) { module.exports = factory(require); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author brian@hovercraftstudios.com
 */

(function(define) { 
define('wire/lib/scope',['require','when','when/sequence','./array','./object','./async','./loader','./lifecycle','./resolver','./proxy','./plugin/registry','./plugin/defaultPlugins'],function(require) {

	var when, sequence, array, object, async, loader, Lifecycle, Resolver,
		proxy, createPluginRegistry, defaultPlugins,
		defer, whenAll, scope, undef;

	when = require('when');
	sequence = require('when/sequence');
	array = require('./array');
	object = require('./object');
	async = require('./async');
	loader = require('./loader');
	Lifecycle = require('./lifecycle');
	Resolver = require('./resolver');
	proxy = require('./proxy');
	createPluginRegistry = require('./plugin/registry');
	defaultPlugins = require('./plugin/defaultPlugins');

	defer = when.defer;
	whenAll = when.all;

	function createScope(spec, parent, options) {
		var s = Object.create(scope, options ? createPropertyDescriptors(options) : {});
		return s.init(spec, parent);
	}

	function createPropertyDescriptors(options) {
		return Object.keys(options).reduce(function(descriptor, key) {
			descriptor[key] = { value: options[key] };
			return descriptor;
		}, {});
	}

	scope = {
		contextHandlers: {},

		init: function(spec, parent) {
			var self, ready, contextDestroyed, taskContext;

			self = this;
			ready = defer();
			contextDestroyed = defer();

			this.parent = parent || {};
			this.ready = ready.promise;
			this.destroyed = contextDestroyed.promise;

			this._inherit(this.parent, ready.promise, contextDestroyed.promise);
			this._initPluginApi();
			this._initDefaultPlugins();
			this._configure();

			taskContext = {
				components: this.components,
				spec: this.spec
			};

			this._executeTasks = function(tasks) {
				return sequence(tasks, taskContext);
			};

			this._destroy = function() {
				this._destroy = noop;
				contextDestroyed.resolve();
				return this._destroyComponents();
			};

			return this._executeInitializers()
				.then(prepareScope)
				.then(finalizeScope)
				.yield(ready.promise);

			function prepareScope() {
				self._parseSpec(spec, ready.resolver);
				self._createComponents(spec);
			}

			function finalizeScope() {
				self._ensureAllModulesLoaded();
			}
		},

		destroy: function() {
			return this._destroy();
		},

		getModule: function(moduleId, spec) {
			var self, module;

			self = this;
			module = defer();

			scanPluginWhenLoaded(typeof moduleId == 'string'
				? this.moduleLoader(moduleId)
				: moduleId, module.resolver);

			return module.promise;

			function scanPluginWhenLoaded(loadModulePromise, moduleReadyResolver) {

				var loadPromise = when(loadModulePromise, function (module) {
					return when(self._scanPlugin(module, spec), function() {
						moduleReadyResolver.resolve(self.modulesReady.promise.yield(module));
					});
				}, moduleReadyResolver.reject);

				self.modulesToLoad && self.modulesToLoad.push(loadPromise);

			}
		},

		getProxy: function(nameOrComponent, onBehalfOf) {
			var self = this;
			return typeof nameOrComponent == 'string'
				? when(this._resolveRefName(nameOrComponent, {}, onBehalfOf), function (component) {
					return self._createProxy(component);
				})
				: self._createProxy(nameOrComponent);
		},

		_createProxy: function(component, metadata) {
			var self, lifecycle;

			self = this;
			lifecycle = this.lifecycle;

			return when(this.modulesReady.promise, function() {
				// Create the base proxy
				var componentProxy = proxy.create(component, lifecycle, metadata);

				// Allow proxy plugins to process/modify the proxy
				componentProxy = self.plugins.proxiers.reduce(
					function(componentProxy, proxyHandler) {
						var overridden = proxyHandler(componentProxy);
						return proxy.isProxy(overridden) ? overridden : componentProxy;
					},
					componentProxy
				);

				if(metadata) {
					componentProxy.path = metadata.path = self._createPath(metadata.id);
					self.proxiedComponents.push(componentProxy);
				}

				return componentProxy;
			});
		},

		_inherit: function(parent, ready, destroyed) {
			var self = this;

			// Descend scope and plugins from parent so that this scope can
			// use them directly via the prototype chain

			this._api = {
				createChild: wireChild.bind(this),
				destroy: this.destroy.bind(this),
				resolve: function(ref, onBehalfOf) {
					return when.resolve(self._resolveRef(ref, onBehalfOf));
				}
			};

			WireContext.prototype =
				this._createWireApi(this._api, object.inherit(parent.components));
			this.components = new WireContext();
			WireContext.prototype = undef;

			this.metadata = object.inherit(parent.metadata);

			this.path = this._createPath(this.name, parent.path);
			this.plugins = createPluginRegistry(parent.plugins||{}, ready, destroyed);

			this.contextHandlers.init = array.delegate(this.contextHandlers.init);
			this.contextHandlers.destroy = array.delegate(this.contextHandlers.destroy);

			this.proxiedComponents = [];

			// These should not be public
			this.modulesToLoad = [];
			this.modulesReady = defer();
			this.moduleLoader = loader(parent, this).load;

			// TODO: Fix this
			// When the parent begins its destroy phase, this child must
			// begin its destroy phase and complete it before the parent.
			// The context hierarchy will be destroyed from child to parent.
			if (parent.destroyed) {
				when(parent.destroyed, this.destroy.bind(this));
			}

			function wireChild(spec, options) {
				return self.createContext(spec, {
					moduleLoader: self.moduleLoader,
					components: self.components,
					metadata: self.metadata,
					destroyed: destroyed
				}, options);
			}
		},

		_initPluginApi: function() {
			// Plugin API
			// wire() API that is passed to plugins.
			var self, api, pluginApi;

			self = this;
			api = this._api;

			pluginApi = this._pluginApi = {};

			pluginApi.contextualize = function(name) {
				function contextualApi(spec, name, path) {
					return self._resolveItem(spec, { id: self._createPath(name, path) });
				}

				contextualApi.createChild = api.createChild;

				contextualApi.resolveRef = function(ref) {
					var onBehalfOf = arguments.length > 1 ? arguments[2] : name;
					return api.resolve(ref, onBehalfOf);
				};

				contextualApi.getProxy = function(nameOrComponent) {
					var onBehalfOf = arguments.length > 1 ? arguments[2] : name;
					return self.getProxy(nameOrComponent, onBehalfOf);
				};

				contextualApi.resolver = pluginApi.resolver;

				return contextualApi;
			};
		},

		_initDefaultPlugins: function() {
			var self = this;

			defaultPlugins.forEach(this._scanPlugin, this);

			// Add a contextualized module factory
			this.plugins.registerPlugin({ factories: {
				module: function(resolver, componentDef) {
					resolver.resolve(self.getModule(componentDef.options, componentDef.spec));
				}
			}});
		},

		_createWireApi: function(api, context) {
			var wireApi = context.wire = function() {
				return api.createChild.apply(undef, arguments);
			};
			wireApi.destroy = context.destroy = api.destroy;

			// Consider deprecating resolve
			// Any reference you could resolve using this should simply
			// be injected instead.
			wireApi.resolve = context.resolve = api.resolve;

			return context;
		},

		_configure: function() {
			var config = {
				pluginApi: this._pluginApi,
				plugins: this.plugins
			};

			this.lifecycle = new Lifecycle(config);
			this.resolver = this._pluginApi.resolver = new Resolver(config);
		},

		_executeInitializers: function() {
			return this._executeTasks(this.contextHandlers.init);
		},

		_parseSpec: function(spec, scopeResolver) {
			var promises, components, metadata, name, d;

			components = this.components;
			metadata = this.metadata;
			promises = [];

			// Setup a promise for each item in this scope
			for (name in spec) {
				// An initializer may have inserted concrete components
				// into the context.  If so, they override components of the
				// same name from the input spec
				if(!object.hasOwn(components, name)) {
					d = defer();

					metadata[name] = {
						id: name,
						spec: spec[name],
						promise: d.promise,
						resolver: d.resolver
					};

					promises.push(components[name] = d.promise);
				}
			}

			// When all scope item promises are resolved, the scope
			// is ready. When this scope is ready, resolve the promise
			// with the objects that were created
			scopeResolver.resolve(whenAll(promises).yield(this));
		},

		_createComponents: function(spec) {
			// Process/create each item in scope and resolve its
			// promise when completed.
			var metadata = this.metadata;
			Object.keys(metadata).forEach(function(name) {
				this._createScopeItem(spec[name], metadata[name]);
			}.bind(this));
		},

		_createScopeItem: function(spec, itemMetadata) {
			// NOTE: Order is important here.
			// The object & local property assignment MUST happen before
			// the chain resolves so that the concrete item is in place.
			// Otherwise, the whole scope can be marked as resolved before
			// the final item has been resolved.
			var item, itemResolver, self;

			self = this;
			item = this._resolveItem(spec, itemMetadata);
			itemResolver = itemMetadata.resolver;

			when(item, function (resolved) {
				self._makeResolvable(itemMetadata, resolved);
				itemResolver.resolve(resolved);
			}, itemResolver.reject);
		},

		_makeResolvable: function(metadata, component) {
			var id = metadata.id;
			if(id != null) {
				this.components[id] = proxy.getTarget(async.getValue(component));
			}
		},

		_resolveItem: function(spec, itemMetadata) {
			var item;

			if (this.resolver.isRef(spec)) {
				// Reference
				item = this._resolveRef(spec, itemMetadata.id);
			} else {
				// Component
				item = this._createItem(spec, itemMetadata);
			}

			return item;
		},

		_createItem: function(spec, itemMetadata) {
			var created;

			if (Array.isArray(spec)) {
				// Array
				created = this._createArray(spec, itemMetadata);

			} else if (object.isObject(spec)) {
				// component spec, create the component
				created = this._createComponent(spec, itemMetadata);

			} else {
				// Plain value
				created = when.resolve(spec);
			}

			return created;
		},

		_createArray: function(arrayDef, arrayMetadata) {
			var self = this;
			// Minor optimization, if it's an empty array spec, just return an empty array.
			return arrayDef.length
				? when.map(arrayDef, function(item) {
					return self._resolveItem(item, { id: arrayMetadata.id + '[]' });
				})
				: [];
		},

		_createComponent: function(spec, componentMetadata) {

			var self, name;

			self = this;
			name = componentMetadata.id;

			// Look for a factory, then use it to create the object
			return when(this._findFactory(spec),
				function (found) {
					var component, factory, options;

					component = defer();
					factory = found.factory;
					options = found.options;

					if (!spec.id) {
						spec.id = name;
					}

					factory(component.resolver, options,
						self._pluginApi.contextualize(name));

					return when(component.promise, function(createdComponent) {
						return self.plugins.isPlugin(createdComponent)
							? createdComponent
							: self._processComponent(createdComponent, componentMetadata);
					}).then(proxy.getTarget);
				},
				function () {
					// No factory found, treat object spec as a nested scope
					return createScope(spec, self).then(function(childScope) {
						// TODO: find a lighter weight solution
						// We are effectively paying the cost of creating a complete scope,
						// and then discarding everything except the component map.
						return object.mixin({}, childScope.components);
					});
				}
			);
		},

		_processComponent: function(component, metadata) {
			var self = this;

			return when(self._createProxy(component, metadata), function(proxy) {
				return proxy.init();

			}).then(function(proxy) {
				// Components become resolvable after the initialization phase
				// This allows circular references to be resolved after init
				self._makeResolvable(metadata, proxy);
				return proxy.startup();
			});
		},

		_findFactory: function(spec) {

			var plugins, found;

			plugins = this.plugins;

			found = getFactory(plugins, spec);
			if(!found) {
				found = when(this.modulesReady.promise, function () {
					return getFactory(plugins, spec) || when.reject();
				});
			}

			return found;
		},

		_ensureAllModulesLoaded: function() {
			var self = this;
			this.modulesReady.resolve(async.until(waitForModules, 0, allModulesLoaded));

			function waitForModules() {
				var modulesToLoad = self.modulesToLoad;
				self.modulesToLoad = [];

				return whenAll(modulesToLoad);
			}

			function allModulesLoaded() {
				return self.modulesToLoad.length === 0;
			}
		},

		_scanPlugin: function(module, spec) {
			var metadata;
			if(spec && spec.id) {
				metadata = this.metadata[spec.id];
				if(metadata) {
					metadata.isPlugin = this.plugins.isPlugin(module);
				}
			}
			return this.plugins.scanModule(module, spec);
		},

		_destroy: noop,

		_destroyComponents: function() {
			var lifecycle, self;

			self = this;
			lifecycle = this.lifecycle;

			return shutdownComponents(this.proxiedComponents)
				.then(destroyComponents)
				.then(releaseResources)
				.then(this._executeDestroyers.bind(this));

			function shutdownComponents(proxiedComponents) {
				return when.reduce(proxiedComponents,
					function(_, proxied) { return proxied.shutdown(); },
					undef);
			}

			function destroyComponents() {
				var components, p;

				components = self.components;

				for (p in  components) {
					delete components[p];
				}

				return when.reduce(self.proxiedComponents,
					function(_, proxied) { return proxied.destroy(); },
					undef);
			}

			function releaseResources() {
				// Free Objects
				self.components = self.parent = self.wireApi
					= self.proxiedComponents = self._pluginApi = self.plugins
					= undef;
			}
		},

		_executeDestroyers: function() {
			return this._executeTasks(this.contextHandlers.destroy);
		},

		_resolveRef: function(ref, onBehalfOf) {
			var scope;

			ref = this.resolver.parse(ref);
			scope = onBehalfOf == ref.name && this.parent.components ? this.parent : this;

			return this._doResolveRef(ref, scope.components, onBehalfOf);
		},

		_resolveRefName: function(refName, options, onBehalfOf) {
			var ref = this.resolver.create(refName, options);

			return this._doResolveRef(ref, this.components, onBehalfOf);
		},

		_doResolveRef: function(ref, scope, onBehalfOf) {
			return when(this.modulesReady.promise, resolveRef);

			function resolveRef() {
				return ref.resolve(function(name) {
					return resolveDeepName(name, scope);
				}, onBehalfOf);
			}
		},

		_createPath: function(name, basePath) {
			var path = basePath || this.path;
			return (path && name) ? (path + '.' + name) : name;
		}
	};

	return createScope;

	function resolveDeepName(name, scope) {
		var parts = name.split('.');

		if(parts.length > 2) {
			return when.reject('Only 1 "." is allowed in refs: ' + name);
		}

		return when.reduce(parts, function(scope, segment) {
			return segment in scope
				? scope[segment]
				: when.reject('Cannot resolve ref: ' + name);
		}, scope);
	}

	function getFactory(plugins, spec) {
		var f, factories, found;

		factories = plugins.factories;

		for (f in factories) {
			if (object.hasOwn(spec, f)) {
				found = {
					factory: factories[f],
					options: {
						options: spec[f],
						spec: spec
					}
				};
				break;
			}
		}

		// Intentionally returns undefined if no factory found
		return found;
	}

	function noop() {}

	function WireContext() {}

});
})(typeof define == 'function'
	// AMD
	? define
	// CommonJS
	: function(factory) { module.exports = factory(require); }
);
/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(define){ 
define('wire/lib/context',['require','./loader','./scope'],function(require) {

	var loader, createScope;

	loader = require('./loader');
	createScope = require('./scope');

	return createContext;

	/**
	 * Creates a new context from the supplied specs, with the supplied parent context.
	 * If specs is an {Array}, it may be a mixed array of string module ids, and object
	 * literal specs.  All spec module ids will be loaded, and then all specs will be
	 * merged from left-to-right (rightmost wins), and the resulting, merged spec will
	 * be wired.
	 * @private
	 *
	 * @param {String|Object|String[]|Object[]} specs
	 * @param {Object} parent context
	 * @param {Object} [options]
	 *
	 * @return {Promise} a promise for the new context
	 */
	function createContext(specs, parent, options) {
		// Do the actual wiring after all specs have been loaded

		if(!options) {
			options = {}
		}

		options.createContext = createContext;

		var moduleLoader = loader(parent, options);

		return moduleLoader.merge(specs).then(function(spec) {
			return createScope(spec, parent, options)
				.then(function(scope) {
					return scope.components;
				});
			}
		);
	}

});
}(typeof define === 'function' ? define : function(factory) { module.exports = factory(require); }));

/** @license MIT License (c) copyright B Cavalier & J Hann */

/*jshint sub:true*/

/**
 * wire
 * Javascript IOC Container
 *
 * wire is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @version 0.9.1
 */
(function(rootSpec, define){ 
define('wire/wire',['require','./lib/context'],function(require) {

	var createContext, rootContext, rootOptions;

	wire.version = '0.9.1';

	createContext = require('./lib/context');

	rootOptions = { require: require };

	/**
	 * Main Programmtic API.  The top-level wire function that wires contexts
	 * as direct children of the (possibly implicit) root context.  It ensures
	 * that the root context has been wired before wiring children.
	 *
	 * @public
	 *
	 * @param spec {Object|String|Array|Promise} can be any one of the following:
	 *  1. Object - wiring spec
	 *  2. String - module id of the wiring spec to load and then wire
	 *  3. Array - mixed array of Strings and Objects, each of which is either
	 *   a wiring spec, or the module id of a wiring spec
	 *  4. Promise - a promise for any of the above
	 *  @param options {Object} wiring options
	 *  @param [options.require] {Function} the platform loader function.  Wire will
	 *   attempt to automatically detect what loader to use (AMD, CommonJS, etc.), but
	 *   if you want to explicitly provide it, you can do so.  In some cases this can
	 *   be useful such as providing a local AMD require function so that module ids
	 *   *within the wiring spec* can be relative.
	 *  @return {Promise} a promise for the resulting wired context
	 */
	function wire(spec, options) {

		// If the root context is not yet wired, wire it first
		if (!rootContext) {
			rootContext = createContext(rootSpec, null, rootOptions);
		}

		// Use the rootContext to wire all new contexts.
		return rootContext.then(function (root) {
			return root.wire(spec, options);
		});
	}

	/**
	 * AMD Loader plugin API
	 * @param name {String} spec module id, or comma-separated list of module ids
	 * @param require {Function} loader-provide local require function
	 * @param callback {Function} callback to call when wiring is completed. May have
	 *  and error property that a function to call to inform the AMD loader of an error.
	 *  See here: https://groups.google.com/forum/?fromgroups#!topic/amd-implement/u0f161drdJA
	 */
	wire.load = function amdLoad(name, require, callback /*, config */) {
		// If it's a string, try to split on ',' since it could be a comma-separated
		// list of spec module ids
		var errback = callback.error || function(e) {
			// Throw uncatchable exception for loaders that don't support
			// AMD error handling.  This will propagate up to the host environment
			setTimeout(function() { throw e; }, 0);
		};

		wire(name.split(','), { require: require }).then(callback, errback);
	};

	/**
	 * AMD Builder plugin API
	 */
	// pluginBuilder: './builder/rjs'
	wire['pluginBuilder'] = './builder/rjs';
	wire['cramPlugin'] = './builder/cram';

	return wire;

});
})(
	this['wire'] || {},
	typeof define == 'function' && define.amd
		? define : function(factory) { module.exports = factory(require); }
);
define('wire', ['wire/wire'], function (main) { return main; });

define('fixture/spec1', ['fixture/module1', 'fixture/spec2'], {

		module1: {
		module: 'fixture/module1'
	},

		some_child_spec: {
		spec: 'fixture/spec2'
	}
} );

define('fixture/module1',[], function() {

	return true;
} );

define('fixture/spec2', ['fixture/module2'], {

		some_data: {
		foo: 'bar'
	},

		module2: {
		module: 'fixture/module2'
	}
} );

define('fixture/module2', [ './module1' ], function( module1 ) {

	return module1;
} );
