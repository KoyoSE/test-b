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

            // const product = d3.select('#selectorProducts');
            containers.product.selectAll('option')
                  .data([])
                  .exit()
                  .remove();
            containers.product.selectAll('option')
                .data(productData) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                .enter()
                .append('option')
                .text(function(d) { return d.text; })
                .attr('value', function(d) { return d.text; });

            // const period = d3.select('#selectorPeriod');
            containers.period.selectAll('option')
                  .data([])
                  .exit()
                  .remove();
            containers.period.selectAll('option')
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

            const provider = containers.provider[0][0].value;
            const product = containers.product[0][0].value;
            const period = containers.period[0][0].value;

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
        const appTemplate = '<select id="selectorProvider"></select> \
        <select id="selectorProducts"></select> \
        <select id="selectorSeries"></select> \
        <select id="selectorIndicator" multiple></select> \
        <select id="selectorPeriod"></select> \
        ';
        const app = {};
        var containers;
        var bfapp;
        app.initalize = function(argBfapp, element) {

            bfapp = argBfapp;

            if (!element) {
                throw new Error('[kFXSelector.initalize error] An element must be specified.');
            }

            // init container

            let appContainer = d3.select(element);
            appContainer.html(appTemplate);

            // set containers
            containers = {
                provider: appContainer.select('#selectorProvider'),
                product: appContainer.select('#selectorProducts'),
                series: appContainer.select('#selectorSeries'),
                indicator: appContainer.select('#selectorIndicator'),
                period: appContainer.select('#selectorPeriod')
            };

            // ---
            // const provider = d3.select('#selectorProvider');
            let data = [
                {'value': 'data generator', 'text': 'Data Generator'},
                {'value': 'gdax', 'text': 'GDAX'},
                {'value': 'quandl', 'text': 'Quandl'}
            ];
            containers.provider.selectAll('option')
                    .on('change', onChangeProvider)
                    .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });

            containers.provider.on('change', onChangeProvider);

            // ---
            // const products = d3.select('#selectorProducts');
            containers.product.on('change', onChangeProducts);

            // ---
            // const series = d3.select('#selectorSeries');
            data = [
                {'value': 'candlestick', 'text': 'Candlestick'},
                {'value': 'ohlc', 'text': 'OHLC'},
                {'value': 'line', 'text': 'Line'},
                {'value': 'point', 'text': 'Point'},
                {'value': 'area', 'text': 'Area'}
            ];
            containers.series.selectAll('option')
                    .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });

            containers.series.on('change', onChangeSeries);

            // ---
            // const indicator = d3.select('#selectorIndicator');
            data = [
                {'value': '', 'text': 'Non'},
                {'value': 'movingAverage', 'text': 'Moving Average'},
                {'value': 'bollinger', 'text': 'Bollinger Bands'},
                {'value': 'rsi', 'text': 'Relative Strength'},
                {'value': 'macd', 'text': 'MACD'},
                {'value': 'volume', 'text': 'Volume'}
            ];
            containers.indicator.selectAll('option')
                    .data(data) // eg., data = [ {'value': 10}, {'value': 11}, {'value': 12} ]
                    .enter()
                    .append('option')
                    .text(function(d) { return d.text; })
                    .attr('value', function(d) { return d.value; });
            containers.indicator.on('change', onChangeIndicator);

            // ---
            containers.period.on('change', onChangePeriod);

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