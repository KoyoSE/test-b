var bfapp = BitFluxS.app()
    .fetchGdaxProducts(true)
    .proportionOfDataToDisplayByDefault(1)
    .displaySelector(false)
    .run('#app-container');

bfapp.changeQuandlProduct('MSFT')
    .changeSeries('ohlc')
    .indicators(['macd']);

