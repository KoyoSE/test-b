(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('d3-request')) :
    typeof define === 'function' && define.amd ? define(['exports', 'd3-request'], factory) :
    (factory((global.fc = global.fc || {}),global.d3));
}(this, (function (exports,d3Request) { 'use strict';

// https://docs.gdax.com/#market-data
var gdax = function () {

    var product = 'BTC-USD';
    var start = null;
    var end = null;
    var granularity = null;

    var gdax = function gdax(cb) {
        var params = [];
        if (start != null) {
            params.push('start=' + start.toISOString());
        }
        if (end != null) {
            params.push('end=' + end.toISOString());
        }
        if (granularity != null) {
            params.push('granularity=' + granularity);
        }
        var url = 'https://api.gdax.com/products/' + product + '/candles?' + params.join('&');
        d3Request.json(url, function (error, data) {
            if (error) {
                cb(error);
                return;
            }
            data = data.map(function (d) {
                return {
                    date: new Date(d[0] * 1000),
                    open: d[3],
                    high: d[2],
                    low: d[1],
                    close: d[4],
                    volume: d[5]
                };
            });
            cb(error, data);
        });
    };

    gdax.product = function (x) {
        if (!arguments.length) {
            return product;
        }
        product = x;
        return gdax;
    };
    gdax.start = function (x) {
        if (!arguments.length) {
            return start;
        }
        start = x;
        return gdax;
    };
    gdax.end = function (x) {
        if (!arguments.length) {
            return end;
        }
        end = x;
        return gdax;
    };
    gdax.granularity = function (x) {
        if (!arguments.length) {
            return granularity;
        }
        granularity = x;
        return gdax;
    };

    return gdax;
};

//  https://www.quandl.com/docs/api#datasets
var quandl = function () {

    function defaultColumnNameMap(colName) {
        return colName[0].toLowerCase() + colName.substr(1);
    }

    var database = 'YAHOO';
    var dataset = 'GOOG';
    var apiKey = null;
    var start = null;
    var end = null;
    var rows = null;
    var descending = false;
    var collapse = null;
    var columnNameMap = defaultColumnNameMap;

    var quandl = function quandl(cb) {
        var params = [];
        if (apiKey != null) {
            params.push('api_key=' + apiKey);
        }
        if (start != null) {
            params.push('start_date=' + start.toISOString().substring(0, 10));
        }
        if (end != null) {
            params.push('end_date=' + end.toISOString().substring(0, 10));
        }
        if (rows != null) {
            params.push('rows=' + rows);
        }
        if (!descending) {
            params.push('order=asc');
        }
        if (collapse != null) {
            params.push('collapse=' + collapse);
        }

        var url = 'https://www.quandl.com/api/v3/datasets/' + database + '/' + dataset + '/data.json?' + params.join('&');

        d3Request.json(url, function (error, data) {
            if (error) {
                cb(error);
                return;
            }

            var datasetData = data.dataset_data;

            var nameMapping = columnNameMap || function (n) {
                return n;
            };
            var colNames = datasetData.column_names.map(function (n, i) {
                return [i, nameMapping(n)];
            }).filter(function (v) {
                return v[1];
            });

            var mappedData = datasetData.data.map(function (d) {
                var output = {};
                colNames.forEach(function (v) {
                    output[v[1]] = v[0] === 0 ? new Date(d[v[0]]) : d[v[0]];
                });
                return output;
            });

            cb(error, mappedData);
        });
    };

    // Unique Database Code (e.g. WIKI)
    quandl.database = function (x) {
        if (!arguments.length) {
            return database;
        }
        database = x;
        return quandl;
    };
    // Unique Dataset Code (e.g. AAPL)
    quandl.dataset = function (x) {
        if (!arguments.length) {
            return dataset;
        }
        dataset = x;
        return quandl;
    };
    // Set To Use API Key In Request (needed for premium set or high frequency requests)
    quandl.apiKey = function (x) {
        if (!arguments.length) {
            return apiKey;
        }
        apiKey = x;
        return quandl;
    };
    // Start Date of Data Series
    quandl.start = function (x) {
        if (!arguments.length) {
            return start;
        }
        start = x;
        return quandl;
    };
    // End Date of Data Series
    quandl.end = function (x) {
        if (!arguments.length) {
            return end;
        }
        end = x;
        return quandl;
    };
    // Limit Number of Rows
    quandl.rows = function (x) {
        if (!arguments.length) {
            return rows;
        }
        rows = x;
        return quandl;
    };
    // Return Results In Descending Order (true) or Ascending (false)
    quandl.descending = function (x) {
        if (!arguments.length) {
            return descending;
        }
        descending = x;
        return quandl;
    };
    // Periodicity of Data (daily | weekly | monthly | quarterly | annual)
    quandl.collapse = function (x) {
        if (!arguments.length) {
            return collapse;
        }
        collapse = x;
        return quandl;
    };
    // Function Used to Normalise the Quandl Column Name To Field Name, Return Null To Skip Field
    quandl.columnNameMap = function (x) {
        if (!arguments.length) {
            return columnNameMap;
        }
        columnNameMap = x;
        return quandl;
    };
    // Expose default column name map
    quandl.defaultColumnNameMap = defaultColumnNameMap;

    return quandl;
};

exports.feedGdax = gdax;
exports.feedQuandl = quandl;

Object.defineProperty(exports, '__esModule', { value: true });

})));
