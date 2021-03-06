YUI.add('autocomplete-base', function (Y) {

/**
 * Provides automatic input completion or suggestions for text input fields and
 * textareas.
 *
 * @module autocomplete
 * @since 3.3.0
 */

/**
 * Provides basic autocomplete logic for an existing text input field or
 * textarea. This module is the lowest-level building block for an autocomplete
 * implementation and doesn't provide a UI layer (see
 * <code>autocomplete-widget</code> for that).
 *
 * @module autocomplete
 * @submodule autocomplete-base
 */

/**
 * The AutoComplete class provides basic autocomplete logic for a text input
 * field or textarea.
 *
 * @class AutoComplete
 * @extends Base
 * @constructor
 * @param {Object} config configuration object
 */

// -- Shorthand & Private Variables --------------------------------------------
var Lang       = Y.Lang,
    isFunction = Lang.isFunction,
    isNumber   = Lang.isNumber,

    AC               = 'autocomplete',
    ALLOW_BROWSER_AC = 'allowBrowserAutocomplete',
    DATA_SOURCE      = 'dataSource',
    INPUT_NODE       = 'inputNode',
    MIN_QUERY_LENGTH = 'minQueryLength',
    QUERY            = 'query',
    QUERY_DELAY      = 'queryDelay',
    REQUEST_TEMPLATE = 'requestTemplate',

    EVT_QUERY        = QUERY,
    EVT_RESULTS      = 'results',
    EVT_VALUE_CHANGE = 'valueChange';

// Constructor
function AutoComplete() {
    AutoComplete.superclass.constructor.apply(this, arguments);
}

Y.AutoComplete = Y.extend(AutoComplete, Y.Base, {
    // -- Public Prototype Methods ---------------------------------------------
    initializer: function (config) {
        var input = this.get(INPUT_NODE);

        if (!input) {
            Y.error('No input node specified');
        }

        if (input.get('nodeName') === 'INPUT') {
            input.setAttribute(AC, this.get(ALLOW_BROWSER_AC) ? 'on' : 'off');
        }

        /**
         * Fires when the contents of the input field have changed and the input
         * value meets the criteria necessary to generate an autocomplete query.
         *
         * @event query
         * @param {EventFacade} e Event facade with the following additional
         *   properties:
         *
         * <dl>
         *   <dt>inputValue (String)</dt>
         *   <dd>
         *     Full contents of the text input field or textarea that generated
         *     the query.
         *   </dd>
         *
         *   <dt>query (String)</dt>
         *   <dd>
         *     Autocomplete query. This is the string that will be used to
         *     request completion results. It may or may not be the same as
         *     <code>inputValue</code>.
         *   </dd>
         * </dl>
         *
         * @preventable _defQueryFn
         */
        this.publish(EVT_QUERY, {
            defaultFn: this._defQueryFn,
            queueable: true
        });

        /**
         * <p>
         * Fires after query results are received from the DataSource. If no
         * DataSource has been set, this event will not fire.
         * </p>
         *
         * <p>
         * To filter or modify results locally, subscribe to the "before" state
         * of this event and, in your listener(s), modify the
         * <code>results</code> property on the event facade. The modified
         * results will then be passed on to subsequent listeners.
         * </p>
         *
         * @event results
         * @param {EventFacade} e Event facade with the following additional
         *   properties:
         *
         * <dl>
         *   <dt>data (Array|Object)</dt>
         *   <dd>
         *     Raw, unfiltered result data (if available).
         *   </dd>
         *
         *   <dt>query (String)</dt>
         *   <dd>
         *     Query that generated these results.
         *   </dd>
         *
         *   <dt>results (Array|Object)</dt>
         *   <dd>
         *     Normalized and filtered result data returned from the DataSource.
         *   </dd>
         * </dl>
         */
        this.publish(EVT_RESULTS, {
            queueable: true
        });

        /**
         * Fires after the input node's value changes, and before the
         * <code>query</code> event.
         *
         * @event valueChange
         * @param {EventFacade} e Event facade with the following additional
         *   properties:
         *
         * <dl>
         *   <dt>newVal (String)</dt>
         *   <dd>
         *     Value of the input node after the change.
         *   </dd>
         *
         *   <dt>prevVal (String)</dt>
         *   <dd>
         *     Value of the input node prior to the change.
         *   </dd>
         * </dl>
         */
        this.publish(EVT_VALUE_CHANGE, {
            preventable: false
        });

        // Attach events.
        this._events = [
            input.on('valueChange', this._onValueChange, this)
        ];
    },

    destructor: function () {
        // Detach events.
        while (this._events.length) {
            this._events.pop().detach();
        }
    },

    // -- Protected Methods ----------------------------------------------------

    /**
     * <p>
     * Returns the query portion of the specified input value, or
     * <code>null</code> if there is no suitable query within the input value.
     * </p>
     *
     * <p>
     * In <code>autocomplete-base</code> this just returns the input value
     * itself, but it can be overridden to implement more complex logic, such as
     * adding support for query delimiters (see the
     * <code>autocomplete-delim</code> module).
     * </p>
     *
     * @method _parseValue
     * @param {String} value input value from which to extract the query
     * @return {String|null} query
     * @protected
     */
    _parseValue: function (value) {
        return value;
    },

    // -- Protected Event Handlers ---------------------------------------------

    /**
     * Handles DataSource responses and fires the <code>result</code> event if
     * there appear to be results.
     *
     * @method _onResponse
     * @param {EventFacade} e
     * @protected
     */
    _onResponse: function (e) {
        var results = e && e.response && e.response.results || e;

        // If results is truthy and not an empty array, then fire the "results"
        // event.
        if (results && !(('length' in results) && results.length === 0)) {
            this.fire(EVT_RESULTS, {
                data   : e.data,
                query  : e.callback.query,
                results: results
            });
        }
    },

    /**
     * Handles <code>valueChange</code> events on the input node and fires a
     * <code>query</code> event when the input value meets the configured
     * criteria.
     *
     * @method _onValueChange
     * @param {EventFacade} e
     * @protected
     */
    _onValueChange: function (e) {
        var delay,
            fire,
            value = e.value || '',
            query = this._parseValue(value),
            that;

        this.fire(EVT_VALUE_CHANGE, {
            newVal : value,
            prevVal: e.oldValue || ''
        });

        if (query.length >= this.get(MIN_QUERY_LENGTH)) {
            delay = this.get(QUERY_DELAY);
            that  = this;

            fire = function () {
                that.fire(EVT_QUERY, {
                    inputValue: value,
                    query     : query
                });
            };

            if (delay) {
                clearTimeout(this._delay);
                this._delay = setTimeout(fire, delay);
            } else {
                fire();
            }
        }
    },

    // -- Protected Default Event Handlers -------------------------------------

    /**
     * Default <code>query</code> event handler. Sets the <code>query</code>
     * property and sends a request to the DataSource if one is configured.
     *
     * @method _defQueryFn
     * @param {EventFacade} e
     * @protected
     */
    _defQueryFn: function (e) {
        var dataSource = this.get(DATA_SOURCE),
            query      = e.query;

        this._set(QUERY, query);

        Y.log('query: ' + query, 'info', AC);

        if (dataSource) {
            Y.log('send request', 'info', AC);
            dataSource.sendRequest({
                request: this.get(REQUEST_TEMPLATE)(query),
                callback: {
                    query  : query,
                    success: Y.bind(this._onResponse, this)
                }
            });
        }
    }
}, {
    // -- Static Properties ----------------------------------------------------

    /**
     * Name of this component.
     *
     * @property NAME
     * @type String
     * @static
     * @final
     */
    NAME: AC,

    /**
     * Attribute definitions for this component.
     *
     * @property ATTRS
     * @type Object
     * @static
     * @final
     */
    ATTRS: {
        /**
         * Whether or not to enable the browser's built-in autocomplete
         * functionality for input fields.
         *
         * @attribute allowBrowserAutocomplete
         * @type Boolean
         * @default false
         * @writeonce
         */
        allowBrowserAutocomplete: {
            validator: Lang.isBoolean,
            value: false,
            writeOnce: 'initOnly'
        },

        /**
         * <p>
         * DataSource object which will be used to make queries. This can be
         * an actual DataSource instance or any other object with a
         * sendRequest() method that has the same signature as DataSource's
         * sendRequest() method.
         * </p>
         *
         * <p>
         * As an alternative to providing a DataSource, you could listen for
         * <code>query</code> events and handle them any way you see fit.
         * Providing a DataSource or DataSource-like object is optional, but
         * will often be simpler.
         * </p>
         *
         * @attribute dataSource
         * @type DataSource|Object
         */
        dataSource: {
            validator: function (value) {
                return value && isFunction(value.sendRequest);
            }
        },

        /**
         * Node to monitor for changes, which will generate <code>query</code>
         * events when appropriate. May be either an input field or a textarea.
         *
         * @attribute inputNode
         * @type Node|HTMLElement|String
         * @writeonce
         */
        inputNode: {
            setter: Y.one,
            writeOnce: 'initOnly'
        },

        /**
         * Minimum number of characters that must be entered before a
         * <code>query</code> event will be fired. A value of <code>0</code>
         * allows empty queries; a negative value will effectively disable all
         * <code>query</code> events.
         *
         * @attribute minQueryLength
         * @type Number
         * @default 1
         */
        minQueryLength: {
            validator: isNumber,
            value: 1
        },

        /**
         * <p>
         * Current query, or <code>null</code> if there is no current query.
         * </p>
         *
         * <p>
         * The query might not be the same as the current value of the input
         * node, both for timing reasons (due to <code>queryDelay</code>) and
         * because when one or more <code>queryDelimiter</code> separators are
         * in use, only the last portion of the delimited input string will be
         * used as the query value.
         * </p>
         *
         * @attribute query
         * @type String|null
         * @default null
         * @readonly
         */
        query: {
            readOnly: true
        },

        /**
         * <p>
         * Number of milliseconds to delay after input before triggering a
         * <code>query</code> event. If new input occurs before this delay is
         * over, the previous input event will be ignored and a new delay will
         * begin.
         * </p>
         *
         * <p>
         * This can be useful both to throttle queries to a remote data source
         * and to avoid distracting the user by showing them less relevant
         * results before they've paused their typing.
         * </p>
         *
         * @attribute queryDelay
         * @type Number
         * @default 150
         */
        queryDelay: {
            validator: function (value) {
                return isNumber(value) && value >= 0;
            },

            value: 150
        },

        /**
         * <p>
         * DataSource request template. This can be a function that accepts a
         * query as a parameter and returns a request string, or it can be a
         * string containing the placeholder "{query}", which will be replaced
         * with the actual URI-encoded query.
         * </p>
         *
         * <p>
         * When using a string template, if it's necessary for the literal
         * string "{query}" to appear in the request, escape it with a slash:
         * "\{query}".
         * </p>
         *
         * @attribute requestTemplate
         * @type Function|String
         * @default encodeURIComponent
         */
        requestTemplate: {
            // Note: While the requestTemplate can be set to either a function
            // or a string, it will always be returned as a function that
            // accepts a query and returns a string.
            value: encodeURIComponent,

            setter: function (template) {
                if (isFunction(template)) {
                    return template;
                }

                template = template.toString();

                return function (query) {
                    // Replace {query} with the URI-encoded query, but turn
                    // \{query} into the literal string "{query}" to allow that
                    // string to appear in the request if necessary.
                    return template.
                        replace(/(^|[^\\])((\\{2})*)\{query\}/, '$1$2' + encodeURIComponent(query)).
                        replace(/(^|[^\\])((\\{2})*)\\(\{query\})/, '$1$2$4');
                };
            }
        }
    }
});

}, '@VERSION@', {
    requires: ['base-base', 'node-base', 'value-change']
});
