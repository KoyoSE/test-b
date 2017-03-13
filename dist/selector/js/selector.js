(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('d3')) :
    typeof define === 'function' && define.amd ? define(['d3'], factory) :
    (factory(global.d3));
}(this, (function (d3) { 'use strict';

    d3 = 'default' in d3 ? d3['default'] : d3;

    // /* global window */
    // import fc from 'd3fc';
    // import BitFlux from 'bf';
    // import option from '../../assets/js/model/menu/option';

    // const bfapp = BitFlux.app()
    //     .fetchGdaxProducts(true)
    //     .proportionOfDataToDisplayByDefault(1)
    //     .run('#app-container');

    var app = function() {

        // const bfapp = BitFlux.app()
        //     .fetchGdaxProducts(true)
        //     .proportionOfDataToDisplayByDefault(1)
        //     .run('#app-container');

        // bfapp.changeQuandlProduct('MSFT');

        // bfapp.changeSeries('ohlc')
        //     .indicators(['macd']);

        // bfapp.changeProduct('BTC-USD');


        // ----- onChange -------
        const onChangeProvider = function() {
            // const index = this.selectedIndex;
            const value = this.value;
            setProducts(value);
        };

        const setProducts = function(value) {
            // const products = document.getElementById('selectorProducts');
            let productData = [];
            let periodData = [];
            switch (value) {
            case 'data generator':
                productData = [
                    {'text': 'Data Generator'}
                ];
                periodData = [
                    {'value': 'day1', 'text': 'Daily'}
                ];
                break;
            case 'gdax':
                // products.length = 0;
                const p = bfapp.getGdaxProducts();
                p.forEach(d => productData.push({text: d.id}));
                // for (let i = 0; i < p.length; i++) {
                //     data[i] = {'value': p[i].id};
                // }
                periodData = [
                    {'value': 'week1', 'text': 'Weekly'},
                    {'value': 'day1', 'text': 'Daily'},
                    {'value': 'hour1', 'text': '1 Hour'},
                    {'value': 'minute5', 'text': '5 Min'},
                    {'value': 'minute1', 'text': '1 Min'}
                ];
                break;
            case 'quandl':
                productData = [
                    {'text': 'GOOG'},
                    {'text': 'MSFT'},
                    {'text': 'BA'}
                ];
                // products.length = 0;
                periodData = [
                    {'value': 'week1', 'text': 'Weekly'},
                    {'value': 'day1', 'text': 'Daily'}
                ];
                break;
            // case 'localBitcoins':
            //     // products.length = 0;
            //     data = [];
            //     break;
            }

            const product = d3.select('#selectorProducts');
            product.selectAll('option')
                  .data([])
                  .exit()
                  .remove();
            product.selectAll('option')
                .data(productData) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                .enter()
                .append('option')
                .text(function(d) { return d.text; })
                .attr('value', function(d) { return d.text; });

            const period = d3.select('#selectorPeriod');
            period.selectAll('option')
                  .data([])
                  .exit()
                  .remove();
            period.selectAll('option')
                    .data(periodData) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });

            changeProduct();
        };

        const onChangeProducts = function() {

            changeProduct();

        };

        const changeProduct = function() {

            // const index = obj.selectedIndex;
            // const value = obj.value;

            // const provider = d3.select('#selectorProvider')[0][0];
            // // const providerIndex = provider.selectedIndex;
            // const providerValue = provider.value;

            const provider = d3.select('#selectorProvider')[0][0].value;
            const product = d3.select('#selectorProducts')[0][0].value;
            const period = d3.select('#selectorPeriod')[0][0].value;

            switch (provider) {
            case 'quandl':
                bfapp.changeQuandlProduct(product, period);
                break;
            default:
                bfapp.changeProduct(product, period);
                break;
            }

        };

        const onChangeSeries = function() {
            // const index = obj.selectedIndex;
            const value = this.value;
            // console.log('Series selectged:' + index + ' value:' + value);

            bfapp.changeSeries(value);

        };

        const onChangeIndicator = function() {

            const options = this.selectedOptions;
            const indicators = [];
            // options.forEach(d => indicators.push(d.value));
            for (let i = 0; i < options.length; i++) {
                indicators.push(options[i].value);
            }
            bfapp.indicators(indicators);
        };

        const onChangePeriod = function() {

            changeProduct();
            // const periodString = this.value;
            // // const periodIndex = this.selectedIndex;
            // const productString = d3.select('#selectorProducts')[0][0].value;

            // // const value = this.value;
            // bfapp.changePeriod(productString, periodString);

        };


        // --------------
        const app = {};
        var bfapp;
        app.initalize = function(argBfapp) {

            bfapp = argBfapp;

            // ---
            const provider = d3.select('#selectorProvider');
            let data = [
                {'value': 'data generator', 'text': 'Data Generator'},
                {'value': 'gdax', 'text': 'GDAX'},
                {'value': 'quandl', 'text': 'Quandl'}
            ];

            provider.selectAll('option')
                    .on('change', onChangeProvider)
                    .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });

            provider.on('change', onChangeProvider);

            // ---
            const products = d3.select('#selectorProducts');
            products.on('change', onChangeProducts);

            // ---
            const series = d3.select('#selectorSeries');
            data = [
                {'value': 'candlestick', 'text': 'Candlestick'},
                {'value': 'ohlc', 'text': 'OHLC'},
                {'value': 'line', 'text': 'Line'},
                {'value': 'point', 'text': 'Point'},
                {'value': 'area', 'text': 'Area'}
            ];
            series.selectAll('option')
                    .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });

            series.on('change', onChangeSeries);

            // ---
            const indicator = d3.select('#selectorIndicator');
            data = [
                {'value': '', 'text': 'Non'},
                {'value': 'movingAverage', 'text': 'Moving Average'},
                {'value': 'bollinger', 'text': 'Bollinger Bands'},
                {'value': 'rsi', 'text': 'Relative Strength'},
                {'value': 'macd', 'text': 'MACD'},
                {'value': 'volume', 'text': 'Volume'}
            ];

            indicator.selectAll('option')
                    .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });

            indicator.on('change', onChangeIndicator);


            // ---
            const period = d3.select('#selectorPeriod');
            // data = [
            //     {'value': 'week1', 'text': 'Weekly'},
            //     {'value': 'day1', 'text': 'Daily'},
            //     {'value': 'hour1', 'text': '1 Hour'},
            //     {'value': 'minute5', 'text': '5 Min'},
            //     {'value': 'minute1', 'text': '1 Min'}
            // ];

            // period.selectAll('option')
            //         .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
            //         .enter()
            //         .append('option')
            //         .text(function(d) { return d.text; })
            //         .attr('value', function(d) { return d.value; });

            period.on('change', onChangePeriod);

            // ---

            setProducts('data generator');
            return app;
        };

        return app;
        // const selecter = function() {
        //     initalize();
        // };

        // return selecter;

        // --------
        // window.onload = function() {

        //     initalize();

        // };
    };

    /*global window */
    window.kFXSelector = app;

})));

//# sourceMappingURL=selector.js.map