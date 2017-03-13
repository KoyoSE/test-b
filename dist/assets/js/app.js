(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('d3'), require('d3fc'), require('d3fc-rebind'), require('jquery'), require('d3fc-financial-feed')) :
    typeof define === 'function' && define.amd ? define(['d3', 'd3fc', 'd3fc-rebind', 'jquery', 'd3fc-financial-feed'], factory) :
    (factory(global.d3,global.fc,global.fc_rebind,global.$,global.fc));
}(this, (function (d3,fc,fcRebind,$,d3fcFinancialFeed) { 'use strict';

    d3 = 'default' in d3 ? d3['default'] : d3;
    fc = 'default' in fc ? fc['default'] : fc;
    fcRebind = 'default' in fcRebind ? fcRebind['default'] : fcRebind;
    $ = 'default' in $ ? $['default'] : $;

    var event = {
        crosshairChange: 'crosshairChange',
        viewChange: 'viewChange',
        newTrade: 'newTrade',
        historicDataLoaded: 'historicDataLoaded',
        historicFeedError: 'historicFeedError',
        streamingFeedError: 'streamingFeedError',
        streamingFeedClose: 'streamingFeedClose',
        dataProductChange: 'dataProductChange',
        dataPeriodChange: 'dataPeriodChange',
        resetToLatest: 'resetToLatest',
        clearAllPrimaryChartIndicatorsAndSecondaryCharts: 'clearAllPrimaryChartIndicatorsAndSecondaryCharts',
        primaryChartSeriesChange: 'primaryChartSeriesChange',
        primaryChartYValueAccessorChange: 'primaryChartYValueAccessorChange',
        primaryChartIndicatorChange: 'primaryChartIndicatorChange',
        secondaryChartChange: 'secondaryChartChange',
        indicatorChange: 'indicatorChange',
        notificationClose: 'notificationClose'
    };

    var legend = function() {
        var priceFormat;
        var volumeFormat;
        var timeFormat;
        var textYOffset = '0.71em';

        var tooltip = fc.chart.tooltip()
            .items([
                ['T', function(d) { return timeFormat(d.date); }],
                ['O', function(d) { return priceFormat(d.open); }],
                ['H', function(d) { return priceFormat(d.high); }],
                ['L', function(d) { return priceFormat(d.low); }],
                ['C', function(d) { return priceFormat(d.close); }],
                ['V', function(d) { return volumeFormat(d.volume); }]
            ])
            .decorate(function(selection) {
                selection.enter()
                    .selectAll('text')
                    .attr('dy', textYOffset);
            });

        function legend(selection) {
            selection.each(function(model) {
                var container = d3.select(this);
                var tooltipContainer = container.select('#tooltip');

                priceFormat = model.product.priceFormat;
                volumeFormat = model.product.volumeFormat;
                timeFormat = model.period.timeFormat;

                container.classed('hidden', !model.data);

                tooltipContainer.layout({flexDirection: 'row'})
                    .selectAll('.tooltip')
                    .layout({marginRight: 40, marginLeft: 15});

                if (model.data) {
                    tooltipContainer.datum(model.data)
                        .call(tooltip);
                }
            });
        }

        return legend;
    };

    var centerOnDate = function(discontinuityProvider, domain, data, centerDate) {
        var dataExtent = fc.util.extent()
            .fields(['date'])(data);

        var domainExtent = fc.util.extent()
            .fields([fc.util.fn.identity])(domain);

        var domainTimeDifference = discontinuityProvider.distance(domainExtent[0], domainExtent[1]);

        if (centerDate.getTime() < dataExtent[0] || centerDate.getTime() > dataExtent[1]) {
            return domainExtent;
        }

        var centeredDataDomain = [
            discontinuityProvider.offset(centerDate, -domainTimeDifference / 2),
            discontinuityProvider.offset(centerDate, domainTimeDifference / 2)
        ];

        var timeShift = 0;
        if (centeredDataDomain[1].getTime() > dataExtent[1].getTime()) {
            timeShift = -discontinuityProvider.distance(dataExtent[1], centeredDataDomain[1]);
        } else if (centeredDataDomain[0].getTime() < dataExtent[0].getTime()) {
            timeShift = discontinuityProvider.distance(centeredDataDomain[0], dataExtent[0]);
        }

        return [
            discontinuityProvider.offset(centeredDataDomain[0], timeShift),
            discontinuityProvider.offset(centeredDataDomain[1], timeShift)
        ];
    };

    var filterDataInDateRange = function(domain, data) {
        var startDate = d3.min(domain, function(d) { return d.getTime(); });
        var endDate = d3.max(domain, function(d) { return d.getTime(); });

        var dataSortedByDate = data.sort(function(a, b) {
            return a.date - b.date;
        });

        var bisector = d3.bisector(function(d) { return d.date; });
        var filteredData = data.slice(
          // Pad and clamp the bisector values to ensure extents can be calculated
          Math.max(0, bisector.left(dataSortedByDate, startDate) - 1),
          Math.min(bisector.right(dataSortedByDate, endDate) + 1, dataSortedByDate.length)
        );
        return filteredData;
    };

    var moveToLatest = function(discontinuityProvider, viewDomainDateExtent, dataDateExtent, ratio) {
        if (arguments.length < 4) {
            ratio = 1;
        }

        // Ensure the earlier data is first in the array
        var sortedViewDomainExtent = fc.util.extent().fields([fc.util.fn.identity])(viewDomainDateExtent);
        var sortedDataExtent = fc.util.extent().fields([fc.util.fn.identity])(dataDateExtent);

        var dataTimeExtent = discontinuityProvider.distance(sortedDataExtent[0], sortedDataExtent[1]);
        var scaledDomainTimeDifference = ratio * discontinuityProvider.distance(sortedViewDomainExtent[0], sortedViewDomainExtent[1]);
        var scaledLiveDataDomain = scaledDomainTimeDifference < dataTimeExtent ?
              [discontinuityProvider.offset(sortedDataExtent[1], -scaledDomainTimeDifference), sortedDataExtent[1]] :
              sortedDataExtent;
        return scaledLiveDataDomain;
    };

    var trackingLatestData = function(domain, data) {
        var latestViewedTime = d3.max(domain, function(d) { return d.getTime(); });
        var latestDatumTime = d3.max(data, function(d) { return d.date.getTime(); });
        return latestViewedTime === latestDatumTime;
    };

    var domain = {
        centerOnDate: centerOnDate,
        filterDataInDateRange: filterDataInDateRange,
        moveToLatest: moveToLatest,
        trackingLatestData: trackingLatestData
    };

    var renderedOnce = false;

    var layout = function(containers, charts, displaySelector) {
        containers.secondaries.style('flex', charts.secondaries().charts().length);
        containers.overlaySecondaries.style('flex', charts.secondaries().charts().length);

        var headRowHeight = 0;
        if (displaySelector) {
            headRowHeight = parseInt(containers.app.select('.head-row').style('height'), 10);
            if (!renderedOnce) {
                headRowHeight +=
                parseInt(containers.app.select('.head-row').style('padding-top'), 10) +
                parseInt(containers.app.select('.head-row').style('padding-bottom'), 10) +
                parseInt(containers.app.select('.head-row').style('margin-bottom'), 10);
                renderedOnce = true;
            }
        }

        var useableHeight = fc.util.innerDimensions(containers.app.node()).height - headRowHeight;

        containers.chartsAndOverlay.style('height', useableHeight + 'px');

        charts.xAxis().dimensionChanged(containers.xAxis);
        charts.nav().dimensionChanged(containers.navbar);
        charts.primary().dimensionChanged(containers.primary);
        charts.secondaries().charts().forEach(function(chart) {
            chart.option.dimensionChanged(containers.secondaries);
        });
    };

    var id = 0;
    var uid = function() {
        return ++id;
    };

    var width = function(element) {
        return $(element).width();
    };

    // Inspired by underscore library implementation of debounce

    var debounce = function(func, wait, immediate) {
        var timeout;
        var args;
        var timestamp;
        var result;

        var later = function() {
            var last = new Date().getTime() - timestamp;

            if (last < wait && last >= 0) {
                timeout = setTimeout(later.bind(this), wait - last);
            } else {
                timeout = null;
                if (!immediate) {
                    result = func.apply(this, args);
                    args = null;
                }
            }
        };

        return function() {
            args = arguments;
            timestamp = new Date().getTime();
            var callNow = immediate && !timeout;

            if (!timeout) {
                timeout = setTimeout(later.bind(this), wait);
            }
            if (callNow) {
                result = func.apply(this, args);
                args = null;
            }

            return result;
        };
    };

    // Inspired by underscore library implementation of throttle

    var throttle = function(func, wait, options) {
        var args;
        var result;
        var timeout = null;
        var previous = 0;

        if (!options) {
            options = {};
        }

        var later = function() {
            if (options.leading === false) {
                previous = 0;
            } else {
                previous = new Date().getTime();
            }

            timeout = null;
            result = func.apply(this, args);

            if (!timeout) {
                args = null;
            }
        };

        return function() {
            var now = new Date().getTime();

            if (!previous && options.leading === false) {
                previous = now;
            }

            var remaining = wait - (now - previous);
            args = arguments;

            if (remaining <= 0 || remaining > wait) {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                previous = now;
                result = func.apply(this, args);

                if (!timeout) {
                    args = null;
                }
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later.bind(this), remaining);
            }

            return result;
        };
    };

    var util = {
        domain: domain,
        layout: layout,
        uid: uid,
        width: width,
        debounce: debounce,
        throttle: throttle
    };

    var zoomBehavior = function(width) {

        var dispatch = d3.dispatch('zoom');

        var zoomBehavior = d3.behavior.zoom();
        var scale;
        var discontinuityProvider;
        var dataDateExtent;

        var allowPan = true;
        var allowZoom = true;
        var trackingLatest = true;

        function controlZoom(zoomExtent) {
            // If zooming, and about to pan off screen, do nothing
            return (zoomExtent[0] > 0 && zoomExtent[1] < 0);
        }

        function resetBehaviour() {
            zoomBehavior.translate([0, 0]);
            zoomBehavior.scale(1);
        }

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function clampDomain(domain, totalXExtent) {
            var clampedDomain = domain;

            if (scale(dataDateExtent[0]) > 0) {
                clampedDomain[1] = scale.invert(scale(domain[1]) + scale(dataDateExtent[0]));
            }

            clampedDomain[0] = d3.max([totalXExtent[0], clampedDomain[0]]);
            clampedDomain[1] = d3.min([totalXExtent[1], clampedDomain[1]]);

            return clampedDomain;
        }

        function zoom(selection) {
            var min = scale(dataDateExtent[0]);
            var max = scale(dataDateExtent[1]);
            var zoomPixelExtent = [min, max - width];

            zoomBehavior.x(scale)
              .on('zoom', function() {
                  var t = d3.event.translate,
                      tx = t[0];

                  var maxDomainViewed = controlZoom(zoomPixelExtent);

                  tx = clamp(tx, -zoomPixelExtent[1], -zoomPixelExtent[0]);
                  zoomBehavior.translate([tx, 0]);

                  var panned = (zoomBehavior.scale() === 1);
                  var zoomed = (zoomBehavior.scale() !== 1);

                  if ((panned && allowPan) || (zoomed && allowZoom)) {
                      var domain = scale.domain();
                      if (maxDomainViewed) {
                          domain = dataDateExtent;
                      } else if (zoomed && trackingLatest) {
                          domain = util.domain.moveToLatest(discontinuityProvider, domain, dataDateExtent);
                      }

                      domain = clampDomain(domain, dataDateExtent);

                      if (domain[0].getTime() !== domain[1].getTime()) {
                          dispatch.zoom(domain);
                      } else {
                          // Ensure the user can't zoom-in infinitely, causing the chart to fail to render
                          // #168, #411
                          resetBehaviour();
                      }
                  } else {
                      resetBehaviour();
                  }
              });

            selection.call(zoomBehavior)
                .on('dblclick.zoom', null);
        }

        zoom.allowPan = function(x) {
            if (!arguments.length) {
                return allowPan;
            }
            allowPan = x;
            return zoom;
        };

        zoom.allowZoom = function(x) {
            if (!arguments.length) {
                return allowZoom;
            }
            allowZoom = x;
            return zoom;
        };

        zoom.trackingLatest = function(x) {
            if (!arguments.length) {
                return trackingLatest;
            }
            trackingLatest = x;
            return zoom;
        };

        zoom.scale = function(x) {
            if (!arguments.length) {
                return scale;
            }
            scale = x;
            return zoom;
        };

        zoom.discontinuityProvider = function(x) {
            if (!arguments.length) {
                return discontinuityProvider;
            }
            discontinuityProvider = x;
            return zoom;
        };

        zoom.dataDateExtent = function(x) {
            if (!arguments.length) {
                return dataDateExtent;
            }
            dataDateExtent = x;
            return zoom;
        };

        d3.rebind(zoom, dispatch, 'on');

        return zoom;
    };

    var responsiveTickCount = function(availableSpacePixels, tickFrequencyPixels, minimumTickCount) {
        if (arguments.length < 3) {
            minimumTickCount = 1;
        }
        return Math.max(Math.ceil(availableSpacePixels / tickFrequencyPixels), minimumTickCount);
    };

    var nav = function() {
        var navHeight = 100; // Also maintain in variables.less
        var bottomMargin = 40; // Also maintain in variables.less
        var navChartHeight = navHeight - bottomMargin;
        var borderWidth = 1; // Also maintain in variables.less
        var extentHeight = navChartHeight - borderWidth;
        var barHeight = extentHeight;
        var handleCircleCenter = borderWidth + barHeight / 2;
        var handleBarWidth = 2;
        var yExtentPadding = [0, 0.04];
        var numberOfSamples = 200;

        var dispatch = d3.dispatch(event.viewChange);
        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();

        var navChart = fc.chart.cartesian(xScale, yScale)
            .yTicks(0)
            .margin({
                bottom: bottomMargin      // Variable also in navigator.less - should be used once ported to flex
            })
            .xOuterTickSize(0)
            .yOuterTickSize(0);

        var viewScale = fc.scale.dateTime();

        var area = fc.series.area()
            .xValue(function(d) { return d.date; })
            .y1Value(function(d) { return d.close; })
            .y0Value(function() { return yScale.domain()[0]; });

        var line = fc.series.line()
            .xValue(function(d) { return d.date; })
            .yValue(function(d) { return d.close; });
        var brush = d3.svg.brush();
        var navMulti = fc.series.multi()
            .series([area, line, brush])
            .decorate(function(selection) {
                var enter = selection.enter();

                selection.selectAll('.background, .extent')
                    .attr('height', extentHeight)
                    .attr('y', borderWidth);

                // overload d3 styling for the brush handles
                // as Firefox does not react properly to setting these through less file.
                enter.selectAll('.resize.w>rect, .resize.e>rect')
                    .attr('width', handleBarWidth)
                    .attr('x', -handleBarWidth / 2);
                selection.selectAll('.resize.w>rect, .resize.e>rect')
                    .attr('height', barHeight)
                    .attr('y', borderWidth);
                enter.select('.extent')
                    .attr('mask', 'url("#brush-mask")');

                // Adds the handles to the brush sides
                var handles = enter.selectAll('.e, .w');
                handles.append('circle')
                    .attr('cy', handleCircleCenter)
                    .attr('r', 7)
                    .attr('class', 'outer-handle');
                handles.append('circle')
                    .attr('cy', handleCircleCenter)
                    .attr('r', 4)
                    .attr('class', 'inner-handle');
            })
            .mapping(function(series) {
                if (series === brush) {
                    brush.y(null)
                        .extent(viewScale.domain());
                    return null;
                } else {
                    // This stops the brush data being overwritten by the point data
                    return this.data;
                }
            });

        var brushMask = fc.series.area()
            .xValue(function(d) { return d.date; })
            .y1Value(function(d) { return d.close; })
            .y0Value(function() { return yScale.domain()[0]; })
            .decorate(function(selection) {
                selection.enter().attr('fill', 'url("#brush-gradient")');
            });

        var brushLine = fc.series.line()
            .xValue(function(d) { return d.date; })
            .yValue(function(d) { return d.close; });

        var layoutWidth;

        var sampler = fc.data.sampler.largestTriangleThreeBucket()
            .x(function(d) { return xScale(d.date); })
            .y(function(d) { return yScale(d.close); });

        var brushMaskMulti = fc.series.multi()
            .series([brushMask, brushLine])
            .xScale(xScale)
            .yScale(yScale);

        function setHide(selection, brushHide) {
            selection.select('.plot-area')
                .selectAll('.e, .w')
                .classed('hidden', brushHide);
        }

        function xEmpty(navBrush) {
            return (navBrush.extent()[0] - navBrush.extent()[1]) === 0;
        }

        function createDefs(selection, data) {
            var defsEnter = selection.selectAll('defs')
                .data([0])
                .enter()
                .append('defs');

            defsEnter.html('<linearGradient id="brush-gradient" x1="0" x2="0" y1="0" y2="1"> \
              <stop offset="0%" class="brush-gradient-top" /> \
              <stop offset="100%" class="brush-gradient-bottom" /> \
          </linearGradient> \
          <mask id="brush-mask"> \
              <rect class="mask-background"></rect> \
          </mask>');

            selection.select('.mask-background').attr({
                width: layoutWidth,
                height: navChartHeight
            });

            xScale.domain(fc.util.extent().fields(['date'])(data));
            yScale.domain(fc.util.extent().fields(['low', 'high']).pad(yExtentPadding)(data));

            selection.select('mask')
                .datum(data)
                .call(brushMaskMulti);
        }

        function nav(selection) {
            var model = selection.datum();

            sampler.bucketSize(Math.max(model.data.length / numberOfSamples, 1));
            var sampledData = sampler(model.data);

            xScale.discontinuityProvider(model.discontinuityProvider);
            viewScale.discontinuityProvider(model.discontinuityProvider);

            createDefs(selection, sampledData);

            viewScale.domain(model.viewDomain);

            var filteredData = util.domain.filterDataInDateRange(
                fc.util.extent().fields(['date'])(sampledData),
                sampledData);
            var yExtent = fc.util.extent()
                .fields(['low', 'high']).pad(yExtentPadding)(filteredData);

            navChart.xDomain(fc.util.extent().fields(['date'])(sampledData))
                .yDomain(yExtent)
                .xTicks(responsiveTickCount(layoutWidth, 100, 2));

            brush.on('brush', function() {
                var brushExtentIsEmpty = xEmpty(brush);

                // Hide the bar if the extent is empty
                setHide(selection, brushExtentIsEmpty);

                if (!brushExtentIsEmpty) {
                    dispatch[event.viewChange](brush.extent());
                }
            })
            .on('brushend', function() {
                var brushExtentIsEmpty = xEmpty(brush);
                setHide(selection, false);
                if (brushExtentIsEmpty) {
                    dispatch[event.viewChange](util.domain.centerOnDate(
                        model.discontinuityProvider,
                        viewScale.domain(),
                        model.data,
                        brush.extent()[0]));
                }
            });

            navChart.plotArea(navMulti);

            selection.datum({data: sampledData})
                .call(navChart);

            // Allow to zoom using mouse, but disable panning
            var zoom = zoomBehavior(layoutWidth)
                .scale(viewScale)
                .trackingLatest(model.trackingLatest)
                .discontinuityProvider(model.discontinuityProvider)
                .dataDateExtent(fc.util.extent().fields(['date'])(model.data))
                .allowPan(false)
                .on('zoom', function(domain) {
                    dispatch[event.viewChange](domain);
                });

            selection.select('.plot-area')
                .call(zoom);
        }

        d3.rebind(nav, dispatch, 'on');

        nav.dimensionChanged = function(container) {
            layoutWidth = util.width(container.node());
            viewScale.range([0, layoutWidth]);
            xScale.range([0, layoutWidth]);
            yScale.range([navChartHeight, 0]);
        };

        return nav;
    };

    function calculateCloseAxisTagPath(width, height) {
        var h2 = height / 2;
        return [
            [0, 0],
            [h2, -h2],
            [width, -h2],
            [width, h2],
            [h2, h2],
            [0, 0]
        ];
    }

    function produceAnnotatedTickValues(scale, annotation) {
        var annotatedTickValues = scale.ticks.apply(scale, []);

        var extent = scale.domain();
        for (var i = 0; i < annotation.length; i++) {
            if (annotation[i] > extent[0] && annotation[i] < extent[1]) {
                annotatedTickValues.push(annotation[i]);
            }
        }
        return annotatedTickValues;
    }

    function getExtentAccessors(multiSeries) {
        return multiSeries.reduce(function(extentAccessors, series) {
            if (series.extentAccessor) {
                return extentAccessors.concat(series.extentAccessor);
            } else {
                return extentAccessors;
            }
        }, []);
    }

    var primary = function() {

        var yAxisWidth = 60;
        var dispatch = d3.dispatch(event.viewChange, event.crosshairChange);

        var currentSeries;
        var currentYValueAccessor = function(d) { return d.close; };
        var currentIndicators = [];
        var zoomWidth;

        var crosshairData = [];
        var crosshair = fc.tool.crosshair()
          .xLabel('')
          .yLabel('')
          .on('trackingmove', function(updatedCrosshairData) {
              if (updatedCrosshairData.length > 0) {
                  dispatch.crosshairChange(updatedCrosshairData[0].datum);
              } else {
                  dispatch.crosshairChange(undefined);
              }
          })
          .on('trackingend', function() {
              dispatch.crosshairChange(undefined);
          });
        crosshair.id = util.uid();

        var gridlines = fc.annotation.gridline()
          .xTicks(0);
        var closeLine = fc.annotation.line()
          .orient('horizontal')
          .value(currentYValueAccessor)
          .label('')
          .decorate(function(g) {
              g.classed('close-line', true);
          });
        closeLine.id = util.uid();

        var multi = fc.series.multi()
            .key(function(series) { return series.id; })
            .mapping(function(series) {
                switch (series) {
                case closeLine:
                    return [this.data[this.data.length - 1]];
                case crosshair:
                    return crosshairData;
                default:
                    return this.visibleData;
                }
            })
            .decorate(function(selection) {
                selection.enter()
                    .select('.area')
                    .attr('fill', 'url("#primary-area-series-gradient")');
            });

        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();

        var primaryChart = fc.chart.cartesian(xScale, yScale)
          .xTicks(0)
          .yOrient('right')
          .margin({
              top: 0,
              left: 0,
              bottom: 0,
              right: yAxisWidth
          })
          .decorate(function(selection) {
              selection.enter()
                  .selectAll('defs')
                  .data([0])
                  .enter()
                  .append('defs')
                  .html('<linearGradient id="primary-area-series-gradient" x1="0%" x2="0%" y1="0%" y2="100%"> \
                      <stop offset="0%" class="primary-area-series-gradient-top" /> \
                      <stop offset="100%" class="primary-area-series-gradient-bottom" /> \
                  </linearGradient>');
          });

        // Create and apply the Moving Average
        var movingAverage = fc.indicator.algorithm.movingAverage();
        var bollingerAlgorithm = fc.indicator.algorithm.bollingerBands();

        function updateMultiSeries() {
            var baseChart = [gridlines, currentSeries.option, closeLine];
            var indicators = currentIndicators.map(function(indicator) { return indicator.option; });
            return baseChart.concat(indicators, crosshair);
        }

        function updateYValueAccessorUsed() {
            movingAverage.value(currentYValueAccessor);
            bollingerAlgorithm.value(currentYValueAccessor);
            closeLine.value(currentYValueAccessor);
            switch (currentSeries.valueString) {
            case 'line':
            case 'point':
                currentSeries.option.yValue(currentYValueAccessor);
                break;
            case 'area':
                currentSeries.option.yValue(currentYValueAccessor);
                currentSeries.option.y0Value(function() { return yScale.domain()[0]; });
                break;
            default:
                break;
            }
        }

        // Call when what to display on the chart is modified (ie series, options)
        function selectorsChanged(model) {
            currentSeries = model.series;
            currentYValueAccessor = model.yValueAccessor.option;
            currentIndicators = model.indicators;
            updateYValueAccessorUsed();
            multi.series(updateMultiSeries());
            primaryChart.yTickFormat(model.product.priceFormat);
            model.selectorsChanged = false;
        }

        function bandCrosshair(data) {
            var width = currentSeries.option.width(data);

            crosshair.decorate(function(selection) {
                selection.classed('band', true);

                selection.selectAll('.vertical > line')
                  .style('stroke-width', width);
            });
        }

        function lineCrosshair(selection) {
            selection.classed('band', false)
                .selectAll('line')
                .style('stroke-width', null);
        }
        function updateCrosshairDecorate(data) {
            if (currentSeries.valueString === 'candlestick' || currentSeries.valueString === 'ohlc') {
                bandCrosshair(data);
            } else {
                crosshair.decorate(lineCrosshair);
            }
        }

        function primary(selection) {
            var model = selection.datum();

            if (model.selectorsChanged) {
                selectorsChanged(model);
            }

            primaryChart.xDomain(model.viewDomain);

            xScale.discontinuityProvider(model.discontinuityProvider);

            crosshair.snap(fc.util.seriesPointSnapXOnly(currentSeries.option, model.visibleData));
            updateCrosshairDecorate(model.visibleData);

            movingAverage(model.data);
            bollingerAlgorithm(model.data);

            // Scale y axis
            // Add percentage padding either side of extreme high/lows
            var extentAccessors = getExtentAccessors(multi.series());
            var paddedYExtent = fc.util.extent()
                .fields(extentAccessors)
                .pad(0.08)(model.visibleData);
            primaryChart.yDomain(paddedYExtent);

            // Find current tick values and add close price to this list, then set it explicitly below
            var latestPrice = currentYValueAccessor(model.data[model.data.length - 1]);
            var tickValuesWithAnnotations = produceAnnotatedTickValues(yScale, [latestPrice]);
            primaryChart.yTickValues(tickValuesWithAnnotations)
              .yDecorate(function(s) {
                  var closePriceTick = s.filter(function(d) { return d === latestPrice; })
                    .classed('close-line', true);

                  var calloutHeight = 18;
                  closePriceTick.select('path')
                    .attr('d', function() {
                        return d3.svg.area()(calculateCloseAxisTagPath(yAxisWidth, calloutHeight));
                    });
                  closePriceTick.select('text')
                    .attr('transform', 'translate(' + calloutHeight / 2 + ',1)');
              });

            var tickValuesWithoutAnnotations = yScale.ticks.apply(yScale, []);
            gridlines.yTickValues(tickValuesWithoutAnnotations);

            // Redraw
            primaryChart.plotArea(multi);
            selection.call(primaryChart);

            var zoom = zoomBehavior(zoomWidth)
              .scale(xScale)
              .trackingLatest(model.trackingLatest)
              .discontinuityProvider(model.discontinuityProvider)
              .dataDateExtent(fc.util.extent().fields(['date'])(model.data))
              .on('zoom', function(domain) {
                  dispatch[event.viewChange](domain);
              });

            selection.select('.plot-area')
              .call(zoom);
        }

        d3.rebind(primary, dispatch, 'on');

        // Call when the main layout is modified
        primary.dimensionChanged = function(container) {
            zoomWidth = util.width(container.node()) - yAxisWidth;
        };

        return primary;
    };

    var multiChart = function() {
        var charts = [];
        var dispatch = d3.dispatch(event.viewChange);

        function key(d) { return d.option.id; }

        var secDataJoin = fc.util.dataJoin()
            .children(true)
            .selector('.secondary-container')
            .element('svg')
            .attr('class', function(d) {
                return 'secondary-container secondary-' + d.valueString;
            })
            .key(function(d) {
                // Issue with elements being regenerated due to data being overwritten. See:
                // https://github.com/ScottLogic/d3fc/blob/0327890d48c9de73a41d901df02bac88dc83e398/src/series/multi.js#L26-L36
                return key(this.__secondaryChart__ || d);
            });

        function multiChart(selection) {
            selection.each(function(model) {
                var secondaries = secDataJoin(this, charts);

                secondaries.each(function(indicator) {
                    this.__secondaryChart__ = indicator;

                    indicator.option.on(event.viewChange, dispatch[event.viewChange]);

                    d3.select(this)
                        .datum(model)
                        .call(indicator.option);
                });
            });
        }

        multiChart.charts = function(x) {
            if (!arguments.length) {
                return charts;
            }
            charts = x;
            return multiChart;
        };

        d3.rebind(multiChart, dispatch, 'on');

        return multiChart;
    };

    var second = 1000;
    var minute = second * 60;
    var hour = minute * 60;
    var day = hour * 24;
    var week = day * 7;
    var month = day * 30;
    var year = day * 365;

    function createInterval(interval, step, duration, format) {
        return { interval: interval, step: step, duration: duration, format: format };
    }

    // 2 days doesn't work well with weekends skipped
    var intervals = [
        [d3.time.second, 1, second, '%H:%M,%d %b'],
        [d3.time.second, 5, 5 * second, '%H:%M,%d %b'],
        [d3.time.second, 15, 15 * second, '%H:%M,%d %b'],
        [d3.time.second, 30, 30 * second, '%H:%M,%d %b'],
        [d3.time.minute, 1, minute, '%H:%M,%d %b'],
        [d3.time.minute, 5, 5 * minute, '%H:%M,%d %b'],
        [d3.time.minute, 15, 15 * minute, '%H:%M,%d %b'],
        [d3.time.minute, 30, 30 * minute, '%H:%M,%d %b'],
        [d3.time.hour, 1, hour, '%H:%M,%d %b'],
        [d3.time.hour, 3, 3 * hour, '%H:%M,%d %b'],
        [d3.time.hour, 6, 6 * hour, '%H:%M,%d %b'],
        [d3.time.hour, 12, 12 * hour, '%H:%M,%d %b'],
        [d3.time.day, 1, day, '%a %d,%b %Y'],
        [d3.time.week, 1, week, '%d %b,%Y'],
        [d3.time.month, 1, month, '%B,%Y'],
        [d3.time.month, 3, 3 * month, '%B,%Y'],
        [d3.time.year, 1, year, '%Y']
    ].map(function(interval) { return createInterval.apply(this, interval); });

    // Based on D3's time scale tick generation, but enforces a strict limit on tick count
    // and allows a minimum tick interval to be specified
    // (no tick interval more frequenct should be applied than the minimum tick interval)
    // https://github.com/d3/d3/blob/9cc9a875e636a1dcf36cc1e07bdf77e1ad6e2c74/src/time/scale.js
    var dateTimeTickValues = function() {
        var domain,
            ticks = 10,
            minimumTickInterval,
            discontinuityProvider;

        function extentSpan(extent) {
            return discontinuityProvider.distance(extent[0], extent[1]);
        }

        function scaleExtent(scaleDomain) {
            var start = scaleDomain[0],
                stop = scaleDomain[scaleDomain.length - 1];
            return start < stop ? [start, stop] : [stop, start];
        }

        function tickIntervalForMultiYearInterval(mappedDomain, m) {
            var extent = scaleExtent(mappedDomain.map(function(d) { return d / year; })),
                span = extent[1] - extent[0],
                step = Math.pow(10, Math.floor(Math.log(span / m) / Math.LN10)),
                err = m / span * step;

            if (err <= 0.15) {
                step *= 10;
            } else if (err <= 0.35) {
                step *= 5;
            } else if (err <= 0.75) {
                step *= 2;
            }

            return createInterval(d3.time.year, step, step * year, '%Y');
        }

        function minimumTickIntervalIndex() {
            var i = -1;
            if (minimumTickInterval != null && minimumTickInterval.length === 2) {
                intervals.forEach(function(interval, intervalIndex) {
                    if (interval.interval === minimumTickInterval[0] && interval.step === minimumTickInterval[1]) {
                        i = intervalIndex;
                    }
                });
            }
            return i;
        }

        function tickInterval(extent, count) {
            var span = extentSpan(extent),
                target = span / count,
                i = d3.bisector(function(d) { return d.duration; }).right(intervals, target);

            var method;
            if (i === intervals.length) {
                method = tickIntervalForMultiYearInterval(extent, count);

                // N.B. there are some edges cases, where more ticks might be created than specified
                // but this to ensure there is at least one tick, if there is a tick count > 0
                var adjustedCount = count;
                while (span / method.duration > count && adjustedCount >= 2 && count > 0) {
                    adjustedCount -= 1;
                    method = tickIntervalForMultiYearInterval(extent, adjustedCount);
                }
            } else {
                var intervalIndex = i > 0 && target / intervals[i - 1].duration < intervals[i].duration / target ? i - 1 : i;
                while (span / intervals[intervalIndex].duration > count && intervalIndex < intervals.length - 1) {
                    intervalIndex += 1;
                }
                method = intervals[Math.max(intervalIndex, minimumTickIntervalIndex())];
            }
            return method;
        }

        function tickValues() {
            if (minimumTickInterval != null && minimumTickIntervalIndex() === -1) {
                throw new Error('Specified minimum tick interval is not supported');
            }

            var extent = scaleExtent(domain),
                method = tickInterval(extent, ticks === null ? 10 : ticks);

            var interval = method.interval,
                step = method.step;

            var calculatedTicks = interval.range(extent[0], new Date(+extent[1] + 1), Math.max(1, step)); // inclusive upper bound
            calculatedTicks.method = [interval, step];
            calculatedTicks.format = method.format;

            return calculatedTicks;
        }

        tickValues.domain = function(x) {
            if (!arguments.length) {
                return domain;
            }
            domain = x;
            return tickValues;
        };

        tickValues.ticks = function(x) {
            if (!arguments.length) {
                return ticks;
            }
            ticks = x;
            return tickValues;
        };

        tickValues.minimumTickInterval = function(x) {
            if (!arguments.length) {
                return minimumTickInterval;
            }
            minimumTickInterval = x;
            return tickValues;
        };


        tickValues.discontinuityProvider = function(x) {
            if (!arguments.length) {
                return discontinuityProvider;
            }
            discontinuityProvider = x;
            return tickValues;
        };

        return tickValues;
    };

    var xAxis = function() {
        var xScale = fc.scale.dateTime();
        var ticks = dateTimeTickValues();

        var xAxis = fc.svg.axis()
          .scale(xScale)
          .orient('bottom')
          .decorate(function(s) {
              s.selectAll('text')
                  .each(function() {
                      var text = d3.select(this);
                      var split = text.text().split(',');
                      text.text(null);
                      text.append('tspan')
                          .attr('class', 'axis-label-main')
                          .attr('x', 0)
                          .text(split[0]);
                      text.append('tspan')
                          .attr('class', 'axis-label-secondary')
                          .attr('dy', '1.42em')
                          .attr('x', 0)
                          .text(split[1]);
                  });
          });

        function xAxisChart(selection) {
            var model = selection.datum();

            xScale.domain(model.viewDomain)
                .discontinuityProvider(model.discontinuityProvider);

            var minimumTickCount = 2,
                tickFrequencyPixels = 100,
                tickCount = responsiveTickCount(xScale.range()[1], tickFrequencyPixels, minimumTickCount),
                period = model.period;

            var tickValues = ticks.domain(xScale.domain())
                .discontinuityProvider(model.discontinuityProvider)
                .ticks(tickCount)
                .minimumTickInterval([period.d3TimeInterval.unit, period.d3TimeInterval.value])();

            xAxis.tickValues(fc.scale.dateTime.tickTransformer(tickValues, model.discontinuityProvider, model.viewDomain))
                .tickFormat(d3.time.format(tickValues.format));

            selection.call(xAxis);
        }

        xAxisChart.dimensionChanged = function(container) {
            xScale.range([0, util.width(container.node())]);
        };

        return xAxisChart;
    };

    var group = function() {
        var dispatch = d3.dispatch(event.viewChange, event.crosshairChange);

        var legend$$1 = legend();

        var nav$$1 = nav()
            .on(event.viewChange, dispatch[event.viewChange]);

        var primary$$1 = primary()
            .on(event.viewChange, dispatch[event.viewChange])
            .on(event.crosshairChange, dispatch[event.crosshairChange]);

        var secondaryCharts = multiChart()
            .on(event.viewChange, dispatch[event.viewChange]);

        var xAxis$$1 = xAxis();

        function group(selection) {
            selection.each(function(model) {
                selection.select('#legend')
                    .datum(model.legend)
                    .call(legend$$1);

                selection.select('#navbar-container')
                    .datum(model.nav)
                    .call(nav$$1);

                selection.select('#primary-container')
                    .datum(model.primary)
                    .call(primary$$1);

                selection.select('#secondaries-container')
                    .datum(model.secondary)
                    .call(secondaryCharts);

                selection.select('#x-axis-container')
                    .datum(model.xAxis)
                    .call(xAxis$$1);
            });
        }

        group.legend = function() {
            return legend$$1;
        };

        group.nav = function() {
            return nav$$1;
        };

        group.primary = function() {
            return primary$$1;
        };

        group.secondaries = function() {
            return secondaryCharts;
        };

        group.xAxis = function() {
            return xAxis$$1;
        };

        d3.rebind(group, dispatch, 'on');

        return group;
    };

    var productAdaptor = function(product) {
        return {
            displayString: product.display,
            option: product
        };
    };

    var periodAdaptor = function(period) {
        return {
            displayString: period.display,
            option: period
        };
    };

    var dropdown = function() {
        var dispatch = d3.dispatch('optionChange');

        var buttonDataJoin = fc.util.dataJoin()
            .selector('button')
            .element('button')
            .attr({
                'class': 'dropdown-toggle',
                'type': 'button',
                'data-toggle': 'dropdown'
            });

        var caretDataJoin = fc.util.dataJoin()
            .selector('.caret')
            .element('span')
            .attr('class', 'caret');

        var listDataJoin = fc.util.dataJoin()
            .selector('ul')
            .element('ul')
            .attr('class', 'dropdown-menu');

        var listItemsDataJoin = fc.util.dataJoin()
            .selector('li')
            .element('li')
            .key(function(d) { return d.displayString; });

        function dropdown(selection) {
            var model = selection.datum();
            var selectedIndex = model.selectedIndex || 0;
            var config = model.config;

            var button = buttonDataJoin(selection, [model.options]);

            if (config.icon) {
                var dropdownButtonIcon = button.selectAll('.icon')
                    .data([0]);
                dropdownButtonIcon.enter()
                    .append('span');
                dropdownButtonIcon.attr('class', 'icon ' + model.options[selectedIndex].icon);
            } else {
                button.select('.icon').remove();
                button.text(function() {
                    return config.title || model.options[selectedIndex].displayString;
                });
            }

            caretDataJoin(button, config.careted ? [0] : []);

            var list = listDataJoin(selection, [model.options]);

            var listItems = listItemsDataJoin(list, model.options);
            var listItemAnchors = listItems.enter()
                .on('click', dispatch.optionChange)
                .append('a')
                .attr('href', '#');

            listItemAnchors.append('span')
                .attr('class', 'icon');
            listItemAnchors.append('span')
                .attr('class', 'name');

            listItems.classed('selected', function(d, i) {
                return model.selectedIndexes ? model.selectedIndexes.indexOf(i) > -1 : i === selectedIndex;
            });

            listItems.selectAll('.icon')
                .attr('class', function(d) { return 'icon ' + d.icon; });
            listItems.selectAll('.name')
                .text(function(d) { return d.displayString; });
        }

        d3.rebind(dropdown, dispatch, 'on');

        return dropdown;
    };

    var tabGroup = function() {
        var dispatch = d3.dispatch('tabClick');
        var dataJoin = fc.util.dataJoin()
          .selector('ul')
          .element('ul');

        function tabGroup(selection) {
            var selectedIndex = selection.datum().selectedIndex || 0;

            var ul = dataJoin(selection, [selection.datum().options]);

            ul.enter()
                .append('ul');

            var li = ul.selectAll('li')
                .data(fc.util.fn.identity);

            li.enter()
                .append('li')
                .append('a')
                .attr('href', '#')
                .on('click', dispatch.tabClick);

            li.classed('active', function(d, i) { return i === selectedIndex; })
                .select('a')
                .text(function(option) { return option.displayString; });

            li.exit()
                .remove();
        }

        d3.rebind(tabGroup, dispatch, 'on');
        return tabGroup;
    };

    var head = function() {

        var dispatch = d3.dispatch(
            event.dataProductChange,
            event.dataPeriodChange,
            event.clearAllPrimaryChartIndicatorsAndSecondaryCharts);

        var dataProductDropdown = dropdown()
            .on('optionChange', dispatch[event.dataProductChange]);

        var dataPeriodSelector = tabGroup()
            .on('tabClick', dispatch[event.dataPeriodChange]);

        var dropdownPeriodSelector = dropdown()
            .on('optionChange', dispatch[event.dataPeriodChange]);

        var head = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var products = model.products;

                container.select('#product-dropdown')
                    .datum({
                        config: model.productConfig,
                        options: products.map(productAdaptor),
                        selectedIndex: products.map(function(p) { return p.id; }).indexOf(model.selectedProduct.id)
                    })
                    .call(dataProductDropdown);

                var periods = model.selectedProduct.periods;
                container.select('#period-selector')
                    .classed('hidden', periods.length <= 1) // TODO: get from model instead?
                    .datum({
                        options: periods.map(periodAdaptor),
                        selectedIndex: periods.indexOf(model.selectedPeriod)
                    })
                    .call(dataPeriodSelector);

                container.select('#mobile-period-selector')
                    .classed('hidden', periods.length <= 1)
                    .datum({
                        config: model.mobilePeriodConfig,
                        options: periods.map(periodAdaptor),
                        selectedIndex: periods.indexOf(model.selectedPeriod)
                    })
                    .call(dropdownPeriodSelector);

                container.select('#clear-indicators')
                    .on('click', dispatch[event.clearAllPrimaryChartIndicatorsAndSecondaryCharts]);
            });
        };

        d3.rebind(head, dispatch, 'on');

        return head;
    };

    var selectors = function() {
        var dispatch = d3.dispatch(
            event.primaryChartSeriesChange,
            event.primaryChartIndicatorChange,
            event.secondaryChartChange);

        var primaryChartSeriesButtons = dropdown()
            .on('optionChange', dispatch[event.primaryChartSeriesChange]);

        var indicatorToggle = dropdown()
            .on('optionChange', function(indicator) {
                if (indicator.isPrimary) {
                    dispatch[event.primaryChartIndicatorChange](indicator);
                } else {
                    dispatch[event.secondaryChartChange](indicator);
                }
            });

        var selectors = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var selectedSeriesIndex = model.seriesSelector.options.map(function(option) {
                    return option.isSelected;
                }).indexOf(true);

                container.select('.series-dropdown')
                    .datum({
                        config: model.seriesSelector.config,
                        options: model.seriesSelector.options,
                        selectedIndex: selectedSeriesIndex
                    })
                    .call(primaryChartSeriesButtons);

                var options = model.indicatorSelector.options;

                var selectedIndicatorIndexes = options
                    .reduce(function(selectedIndexes, option, index) {
                        return option.isSelected ? selectedIndexes.concat(index) : selectedIndexes;
                    }, []);

                container.select('.indicator-dropdown')
                    .datum({
                        config: model.indicatorSelector.config,
                        options: options,
                        selectedIndexes: selectedIndicatorIndexes
                    })
                    .call(indicatorToggle);

            });
        };

        d3.rebind(selectors, dispatch, 'on');

        return selectors;
    };

    var navigationReset = function() {

        var dispatch = d3.dispatch(event.resetToLatest);

        function navReset(selection) {
            var model = selection.datum();

            var resetButtonGroup = selection.selectAll('g')
                .data([model]);

            var resetButtonGroupEnter = resetButtonGroup.enter()
                .append('g')
                .attr('class', 'reset-button')
                .on('click', dispatch[event.resetToLatest]);

            resetButtonGroupEnter.append('path')
                .attr('d', 'M1.5 1.5h13.438L23 20.218 14.937 38H1.5l9.406-17.782L1.5 1.5z');

            resetButtonGroupEnter.append('rect')
                .attr({
                    width: 5,
                    height: 28,
                    x: 26,
                    y: 6
                });

            resetButtonGroup.classed('hidden', model.trackingLatest);
        }

        d3.rebind(navReset, dispatch, 'on');

        return navReset;
    };

    var editIndicatorGroup = function() {
        var dispatch = d3.dispatch(event.indicatorChange);

        function editIndicatorGroup(selection) {
            selection.each(function(model) {
                var sel = d3.select(this);

                var div = sel.selectAll('div')
                    .data(model.selectedIndicators, function(d) {
                        return d.valueString;
                    });

                var containersEnter = div.enter()
                    .append('div')
                    .attr('class', 'edit-indicator');

                containersEnter.append('span')
                    .attr('class', 'icon bf-icon-delete')
                    .on('click', dispatch.indicatorChange);

                containersEnter.append('span')
                    .attr('class', 'indicator-label')
                    .text(function(d) {
                        return d.displayString;
                    });

                div.exit()
                    .remove();
            });
        }

        d3.rebind(editIndicatorGroup, dispatch, 'on');

        return editIndicatorGroup;

    };

    var overlay = function() {
        var dispatch = d3.dispatch(
            event.primaryChartIndicatorChange,
            event.secondaryChartChange,
            event.dataProductChange);

        var primaryChartIndicatorToggle = editIndicatorGroup()
            .on(event.indicatorChange, dispatch[event.primaryChartIndicatorChange]);

        var secondaryChartToggle = editIndicatorGroup()
            .on(event.indicatorChange, dispatch[event.secondaryChartChange]);

        var dataProductDropdown = dropdown()
            .on('optionChange', dispatch[event.dataProductChange]);

        var secondariesDataJoin = fc.util.dataJoin()
            .selector('.overlay-secondary-container')
            .element('div')
            .attr('class', 'overlay-secondary-container')
            .key(function(d) { return d.displayString;});

        var overlay = function(selection, displaySelector) {
            selection.each(function(model) {
                var container = d3.select(this);

                var products = model.products;
                if (displaySelector) {
                    container.select('#mobile-product-dropdown')
                        .datum({
                            config: model.productConfig,
                            options: products.map(productAdaptor),
                            selectedIndex: products.map(function(p) { return p.id; }).indexOf(model.selectedProduct.id)
                        })
                        .call(dataProductDropdown);
                }

                container.select('#overlay-primary-container .edit-indicator-container')
                    .datum({selectedIndicators: model.primaryIndicators})
                    .call(primaryChartIndicatorToggle);

                var secondariesContainer = container.select('#overlay-secondaries-container');

                var secondaries = secondariesDataJoin(secondariesContainer, model.secondaryIndicators);

                var editIndicatorContainer = secondaries.enter()
                    .append('div')
                    .attr('class', 'edit-indicator-container');

                editIndicatorContainer.each(function(d) {
                    d3.select(this).datum({selectedIndicators: [d]}).call(secondaryChartToggle);
                });
            });
        };

        d3.rebind(overlay, dispatch, 'on');

        return overlay;
    };

    var menu = {
        head: head,
        selectors: selectors,
        navigationReset: navigationReset,
        overlay: overlay
    };

    var callbackInvalidator = function() {
        var n = 0;

        function callbackInvalidator(callback) {
            var id = ++n;
            return function(err, data) {
                if (id < n) { return; }
                callback(err, data);
            };
        }

        callbackInvalidator.invalidateCallback = function() {
            n++;
            return callbackInvalidator;
        };

        return callbackInvalidator;
    };

    var collectOhlc = function() {

        var date = function(d) { return d.date; };
        var volume = function(d) { return Number(d.volume); };
        var price = function(d) { return Number(d.price); };
        var granularity = 60;

        function getBucketStart(tradeDate) {
            var granularityInMs = granularity * 1000;
            return new Date(Math.floor(tradeDate.getTime() / granularityInMs) * granularityInMs);
        }

        var collectOhlc = function(data, trade) {
            var bucketStart = getBucketStart(date(trade));
            var tradePrice = price(trade);
            var tradeVolume = volume(trade);
            var bisectDate = d3.bisector(function(d) { return d.date; }).left;
            var existing = data.filter(function(d) {
                return d.date.getTime() === bucketStart.getTime();
            })[0];
            if (existing) {
                existing.high = Math.max(tradePrice, existing.high);
                existing.low = Math.min(tradePrice, existing.low);
                existing.close = tradePrice;
                existing.volume += tradeVolume;
            } else {
                data.splice(bisectDate(data, bucketStart), 0, {
                    date: bucketStart,
                    open: tradePrice,
                    high: tradePrice,
                    low: tradePrice,
                    close: tradePrice,
                    volume: tradeVolume
                });
            }
        };

        collectOhlc.granularity = function(x) {
            if (!arguments.length) {
                return granularity;
            }
            granularity = x;
            return collectOhlc;
        };

        collectOhlc.price = function(x) {
            if (!arguments.length) {
                return price;
            }
            price = x;
            return collectOhlc;
        };

        collectOhlc.volume = function(x) {
            if (!arguments.length) {
                return volume;
            }
            volume = x;
            return collectOhlc;
        };

        collectOhlc.date = function(x) {
            if (!arguments.length) {
                return date;
            }
            date = x;
            return collectOhlc;
        };

        return collectOhlc;
    };

    var dataInterface = function() {

        var dispatch = d3.dispatch(
            event.newTrade,
            event.historicDataLoaded,
            event.historicFeedError,
            event.streamingFeedError,
            event.streamingFeedClose);

        var _collectOhlc = collectOhlc()
            .date(function(d) {return new Date(d.time); })
            .volume(function(d) {return Number(d.size); });

        var source,
            callbackGenerator = callbackInvalidator(),
            candlesOfData = 400,
            data = [];

        function invalidate() {
            if (source && source.streamingFeed) {
                source.streamingFeed.close();
            }
            data = [];
            callbackGenerator.invalidateCallback();
        }

        function dateSortAscending(dataToSort) {
            return dataToSort.sort(function(a, b) {
                return a.date - b.date;
            });
        }

        function handleStreamingFeedEvents() {
            if (source.streamingFeed != null) {
                source.streamingFeed.on('message', function(trade) {
                    _collectOhlc(data, trade);
                    dispatch[event.newTrade](data, source);
                })
                .on('error', function(streamingFeedError) {
                    dispatch[event.streamingFeedError](streamingFeedError, source);
                })
                .on('close', function(closeEvent) {
                    dispatch[event.streamingFeedClose](closeEvent, source);
                });
                source.streamingFeed();
            }
        }

        // ----

        function dataInterface(granularity, product) {
            // ?
            invalidate();

            if (arguments.length === 2) {
                source = product.source;
                source.historicFeed.product(product.id);

                if (source.streamingFeed != null) {
                    source.streamingFeed.product(product.id);
                }
            }

            var now = new Date();

            // set parameter
            source.historicFeed.end(now)
                .candles(candlesOfData)
                .granularity(granularity);

            _collectOhlc.granularity(granularity);

            source.historicFeed(callbackGenerator(function(historicFeedError, newData) {
                if (!historicFeedError) {
                    data = dateSortAscending(newData);
                    dispatch[event.historicDataLoaded](data, source);
                    handleStreamingFeedEvents();
                } else {
                    dispatch[event.historicFeedError](historicFeedError, source);
                }
            }));
        }

        // ----

        dataInterface.candlesOfData = function(x) {
            if (!arguments.length) {
                return candlesOfData;
            }
            candlesOfData = x;
            return dataInterface;
        };

        d3.rebind(dataInterface, dispatch, 'on');

        return dataInterface;
    };

    var toast = function() {

        var dispatch = d3.dispatch(event.notificationClose);

        var panelDataJoin = fc.util.dataJoin()
            .selector('div.alert-content')
            .element('div')
            .attr('class', 'alert-content');

        var toastDataJoin = fc.util.dataJoin()
            .selector('div.alert')
            .element('div')
            .attr({'class': 'alert alert-info alert-dismissible', 'role': 'alert'})
            .key(function(d) { return d.id; });

        var toast = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var panel = panelDataJoin(container, [model]);
                panel.enter().html('<div class="messages"></div>');

                var toasts = toastDataJoin(panel.select('.messages'), model.messages);

                var toastsEnter = toasts.enter();
                toastsEnter.html(
                    '<button type="button" class="close" aria-label="Close"> \
                    <span aria-hidden="true">&times;</span> \
                </button> \
                <span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> \
                <span class="sr-only">Error:</span> \
                <span class="message"></span>');

                toastsEnter.select('.close')
                    .on('click', function(d) { dispatch[event.notificationClose](d.id); });

                toasts.select('.message')
                    .text(function(d) { return d.message; });
            });
        };

        d3.rebind(toast, dispatch, 'on');

        return toast;
    };

    var notification = {
        toast: toast
    };

    var message = function(message) {
        return {
            id: util.uid(),
            message: message
        };
    };

    var period = function(display, seconds, d3TimeInterval, timeFormat) {
        return {
            display: display || '1 day',
            seconds: seconds || 60 * 60 * 24,
            d3TimeInterval: d3TimeInterval || {unit: d3.time.day, value: 1},
            timeFormat: d3.time.format(timeFormat || '%b %d')
        };
    };

    var product = function(id, display, periods, source, volumeFormat, priceFormat) {
        return {
            id: id,
            display: display || 'Unspecified Product',
            priceFormat: d3.format(priceFormat || '.2f'),
            volumeFormat: d3.format(volumeFormat || '.2f'),
            periods: periods || [],
            source: source
        };
    };

    var source = function(historicFeed, historicNotificationFormatter, streamingFeed, streamingNotificationFormatter, discontinuityProvider) {
        return {
            historicFeed: historicFeed,
            historicNotificationFormatter: historicNotificationFormatter,
            streamingFeed: streamingFeed,
            streamingNotificationFormatter: streamingNotificationFormatter,
            discontinuityProvider: discontinuityProvider
        };
    };

    var data = {
        period: period,
        product: product,
        source: source
    };

    var webSocketCloseEventFormatter = function(event) {
        var message;
        if (event.wasClean === false && event.code !== 1000 && event.code !== 1006) {
            var reason = event.reason || 'Unkown reason.';
            message = 'Disconnected from live stream: ' + event.code + ' ' + reason;
        }
        return message;
    };

    var gdaxStreamingErrorResponseFormatter = function(event) {
        var message;
        if (event.type === 'error' && event.message) {
            message = 'Live stream error: ' + event.message;
        } else if (event.type === 'close') {
            // The WebSocket's error event doesn't contain much useful information,
            // so the close event is used to report errors instead
            message = webSocketCloseEventFormatter(event);
        }
        return message;
    };

    var dropdownConfig = function(title, careted, listIcons, icon) {
        return {
            title: title || null,
            careted: careted || false,
            listIcons: listIcons || false,
            icon: icon || false
        };
    };

    var head$1 = function(initialProducts, initialSelectedProduct, initialSelectedPeriod) {
        return {
            productConfig: dropdownConfig(null, true),
            mobilePeriodConfig: dropdownConfig(),
            products: initialProducts,
            selectedProduct: initialSelectedProduct,
            selectedPeriod: initialSelectedPeriod,
            alertMessages: [],
            primaryIndicators: [],
            secondaryIndicators: []
        };
    };

    var overlay$1 = function(initialProducts, initialSelectedProduct) {
        return {
            primaryIndicators: [],
            secondaryIndicators: [],
            productConfig: dropdownConfig(),
            products: initialProducts,
            selectedProduct: initialSelectedProduct
        };
    };

    var option = function(displayString, valueString, option, icon, isPrimary) {
        return {
            displayString: displayString, // TODO: is 'displayName' better?
            valueString: valueString, // TODO: is this an id?
            option: option, // TODO: Ideally, remove.
            isSelected: false,
            icon: icon,
            isPrimary: isPrimary
        };
    };

    var selector = function(config, options) {
        return {
            config: config,
            options: options
        };
    };

    var menu$1 = {
        head: head$1,
        periodAdaptor: periodAdaptor,
        productAdaptor: productAdaptor,
        overlay: overlay$1,
        dropdownConfig: dropdownConfig,
        option: option,
        selector: selector
    };

    var group$1 = function(legend, nav, primary, secondary, xAxis) {
        return {
            legend: legend,
            nav: nav,
            primary: primary,
            secondary: secondary,
            xAxis: xAxis
        };
    };

    var legend$1 = function(initialProduct, initialPeriod) {
        return {
            data: undefined,
            product: initialProduct,
            period: initialPeriod
        };
    };

    var nav$1 = function(initialDiscontinuityProvider) {
        return {
            data: [],
            viewDomain: [],
            trackingLatest: true,
            discontinuityProvider: initialDiscontinuityProvider
        };
    };

    var navigationReset$1 = function() {
        return {
            trackingLatest: true
        };
    };

    var candlestickSeries = function() {
        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();
        var barWidth = fc.util.fractionalBarWidth(0.75);
        var xValue = function(d) { return d.date; };
        var xValueScaled = function(d, i) { return xScale(xValue(d, i)); };
        var yLowValue = function(d) { return d.low; };
        var yHighValue = function(d) { return d.high; };
        var yCloseValue = function(d) { return d.close; };

        var candlestickSvg = fc.svg.candlestick()
          .x(function(d) { return xScale(d.date); })
          .open(function(d) { return yScale(d.open); })
          .high(function(d) { return yScale(yHighValue(d)); })
          .low(function(d) { return yScale(yLowValue(d)); })
          .close(function(d) { return yScale(d.close); });

        var upDataJoin = fc.util.dataJoin()
          .selector('path.up')
          .element('path')
          .attr('class', 'up');

        var downDataJoin = fc.util.dataJoin()
          .selector('path.down')
          .element('path')
          .attr('class', 'down');

        var candlestick = function(selection) {
            selection.each(function(data) {
                candlestickSvg.width(barWidth(data.map(xValueScaled)));

                var upData = data.filter(function(d) { return d.open < d.close; });
                var downData = data.filter(function(d) { return d.open >= d.close; });

                upDataJoin(this, [upData])
                  .attr('d', candlestickSvg);

                downDataJoin(this, [downData])
                  .attr('d', candlestickSvg);
            });
        };

        candlestick.xScale = function(x) {
            if (!arguments.length) {
                return xScale;
            }
            xScale = x;
            return candlestick;
        };
        candlestick.yScale = function(x) {
            if (!arguments.length) {
                return yScale;
            }
            yScale = x;
            return candlestick;
        };
        candlestick.xValue = function(x) {
            if (!arguments.length) {
                return xValue;
            }
            xValue = x;
            return candlestick;
        };
        candlestick.yLowValue = function(x) {
            if (!arguments.length) {
                return yLowValue;
            }
            yLowValue = x;
            return candlestick;
        };
        candlestick.yHighValue = function(x) {
            if (!arguments.length) {
                return yHighValue;
            }
            yHighValue = x;
            return candlestick;
        };
        candlestick.yCloseValue = function(x) {
            if (!arguments.length) {
                return yCloseValue;
            }
            yCloseValue = x;
            return candlestick;
        };
        candlestick.width = function(data) {
            return barWidth(data.map(xValueScaled));
        };

        return candlestick;
    };

    var primary$1 = function(initialProduct, initialDiscontinuityProvider) {
        var model = {
            data: [],
            visibleData: [],
            trackingLatest: true,
            viewDomain: [],
            selectorsChanged: true,
            discontinuityProvider: initialDiscontinuityProvider
        };

        var _product = initialProduct;
        Object.defineProperty(model, 'product', {
            get: function() { return _product; },
            set: function(newValue) {
                _product = newValue;
                model.selectorsChanged = true;
            }
        });

        var candlestick = candlestickSeries();
        candlestick.id = util.uid();
        var _series = option('Candlestick', 'candlestick', candlestick);
        _series.option.extentAccessor = ['high', 'low'];
        Object.defineProperty(model, 'series', {
            get: function() { return _series; },
            set: function(newValue) {
                _series = newValue;
                model.selectorsChanged = true;
            }
        });

        var _yValueAccessor = {option: function(d) { return d.close; }};
        Object.defineProperty(model, 'yValueAccessor', {
            get: function() { return _yValueAccessor; },
            set: function(newValue) {
                _yValueAccessor = newValue;
                model.selectorsChanged = true;
            }
        });

        var _indicators = [];
        Object.defineProperty(model, 'indicators', {
            get: function() { return _indicators; },
            set: function(newValue) {
                _indicators = newValue;
                model.selectorsChanged = true;
            }
        });

        return model;
    };

    var secondary = function(initialProduct, initialDiscontinuityProvider) {
        return {
            data: [],
            visibleData: [],
            viewDomain: [],
            trackingLatest: true,
            product: initialProduct,
            discontinuityProvider: initialDiscontinuityProvider,
            indicators: []
        };
    };

    var xAxis$1 = function(initialPeriod, initialDiscontinuityProvider) {
        return {
            viewDomain: [],
            period: initialPeriod,
            discontinuityProvider: initialDiscontinuityProvider
        };
    };

    var chart = {
        group: group$1,
        legend: legend$1,
        nav: nav$1,
        navigationReset: navigationReset$1,
        primary: primary$1,
        secondary: secondary,
        xAxis: xAxis$1
    };

    var messages = function() {
        return {
            messages: []
        };
    };

    var notification$1 = {
        message: message,
        messages: messages
    };

    var model = {
        menu: menu$1,
        chart: chart,
        data: data,
        notification: notification$1
    };

    var base = function() {
        var dispatch = d3.dispatch(event.viewChange);
        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();
        var trackingLatest = true;
        var yAxisWidth = 60;

        var multi = fc.series.multi();
        var chart = fc.chart.cartesian(xScale, yScale)
            .plotArea(multi)
            .xTicks(0)
            .yOrient('right')
            .margin({
                top: 0,
                left: 0,
                bottom: 0,
                right: yAxisWidth
            });
        var zoomWidth;

        function secondary(selection) {
            selection.each(function(model) {
                xScale.discontinuityProvider(model.discontinuityProvider);

                var container = d3.select(this)
                    .datum(model.visibleData)
                    .call(chart);

                var zoom = zoomBehavior(zoomWidth)
                    .scale(xScale)
                    .trackingLatest(trackingLatest)
                    .discontinuityProvider(model.discontinuityProvider)
                    .dataDateExtent(fc.util.extent().fields(['date'])(model.data))
                    .on('zoom', function(domain) {
                        dispatch[event.viewChange](domain);
                    });

                container.select('.plot-area-container')
                    .call(zoom);
            });
        }

        secondary.trackingLatest = function(x) {
            if (!arguments.length) {
                return trackingLatest;
            }
            trackingLatest = x;
            return secondary;
        };

        d3.rebind(secondary, dispatch, 'on');
        d3.rebind(secondary, multi, 'series', 'mapping', 'decorate');
        d3.rebind(secondary, chart, 'yTickValues', 'yTickFormat', 'yTicks', 'xDomain', 'yDomain');

        secondary.dimensionChanged = function(container) {
            zoomWidth = util.width(container.node()) - yAxisWidth;
        };

        return secondary;
    };

    var macd = function() {
        var dispatch = d3.dispatch(event.viewChange);
        var zeroLine = fc.annotation.line()
            .value(0)
            .label('');
        var renderer = fc.indicator.renderer.macd();
        var algorithm = fc.indicator.algorithm.macd();

        var chart = base()
            .series([zeroLine, renderer])
            .yTicks(5)
            .mapping(function(series) {
                return series === zeroLine ? [0] : this;
            })
            .decorate(function(g) {
                g.enter()
                    .attr('class', function(d, i) {
                        return ['multi zero', 'multi'][i];
                    });
            })
            .on(event.viewChange, function(domain) {
                dispatch[event.viewChange](domain);
            });

        function macd(selection) {
            var model = selection.datum();
            algorithm(model.data);

            var paddedYExtent = fc.util.extent()
                .fields(['macd'])
                .symmetricalAbout(0)
                .pad(0.08)(model.data.map(function(d) { return d.macd; }));
            chart.trackingLatest(model.trackingLatest)
                .xDomain(model.viewDomain)
                .yDomain(paddedYExtent);

            selection.call(chart);
        }

        d3.rebind(macd, dispatch, 'on');

        macd.dimensionChanged = function(container) {
            chart.dimensionChanged(container);
        };

        return macd;
    };

    var rsi = function() {
        var dispatch = d3.dispatch(event.viewChange);
        var renderer = fc.indicator.renderer.relativeStrengthIndex();
        var algorithm = fc.indicator.algorithm.relativeStrengthIndex()
            .value(function(d) { return d.close; });
        var tickValues = [renderer.lowerValue(), 50, renderer.upperValue()];

        var chart = base()
            .series([renderer])
            .yTickValues(tickValues)
            .on(event.viewChange, function(domain) {
                dispatch[event.viewChange](domain);
            });

        function rsi(selection) {
            var model = selection.datum();
            algorithm(model.data);

            chart.trackingLatest(model.trackingLatest)
                .xDomain(model.viewDomain)
                .yDomain([0, 100]);

            selection.call(chart);
        }

        d3.rebind(rsi, dispatch, 'on');

        rsi.dimensionChanged = function(container) {
            chart.dimensionChanged(container);
        };

        return rsi;
    };

    var volume = function() {
        var dispatch = d3.dispatch(event.viewChange);
        var volumeBar = fc.series.bar()
          .xValue(function(d) { return d.date; })
          .yValue(function(d) { return d.volume; });

        var chart = base()
            .series([volumeBar])
            .yTicks(4)
            .on(event.viewChange, function(domain) {
                dispatch[event.viewChange](domain);
            });

        function volume(selection) {
            selection.each(function(model) {
                var paddedYExtent = fc.util.extent()
                    .fields(['volume'])
                    .pad(0.08)(model.data);
                if (paddedYExtent[0] < 0) {
                    paddedYExtent[0] = 0;
                }
                chart.yTickFormat(model.product.volumeFormat)
                    .trackingLatest(model.trackingLatest)
                    .xDomain(model.viewDomain)
                    .yDomain(paddedYExtent);

                selection.call(chart);
            });
        }

        d3.rebind(volume, dispatch, 'on');

        volume.dimensionChanged = function(container) {
            chart.dimensionChanged(container);
        };

        return volume;
    };

    var secondary$1 = {
        base: base,
        macd: macd,
        rsi: rsi,
        volume: volume
    };

    var chart$1 = {
        legend: legend,
        nav: nav,
        primary: primary,
        xAxis: xAxis,
        secondary: secondary$1,
        multiChart: multiChart,
        group: group
    };

    var dataGeneratorAdaptor = function() {

        var dataGenerator = fc.data.random.financial(),
            // allowedPeriods = [60 * 60 * 24], // day1
            candles,
            end,
            granularity,
            product = null;

        var dataGeneratorAdaptor = function(cb) {
            end.setHours(0, 0, 0, 0);
            var startDate = d3.time.day.offset(end, -(candles - 1));
            dataGenerator.startDate(startDate);
            var data = dataGenerator(candles);
            cb(null, data);
        };

        // -------------

        dataGeneratorAdaptor.candles = function(x) {
            if (!arguments.length) {
                return candles;
            }
            candles = x;
            return dataGeneratorAdaptor;
        };

        // end datetime
        dataGeneratorAdaptor.end = function(x) {
            if (!arguments.length) {
                return end;
            }
            end = x;
            return dataGeneratorAdaptor;
        };

        // 粒状(性) Unit sec
        dataGeneratorAdaptor.granularity = function(x) {
            if (!arguments.length) {
                return granularity;
            }
            // if (allowedPeriods.indexOf(x) === -1) {
            //     throw new Error('Granularity of ' + x + ' is not supported. '
            //      + 'Random Financial Data Generator only supports daily data.');
            // }
            granularity = x;
            return dataGeneratorAdaptor;
        };

        // Product
        dataGeneratorAdaptor.product = function(x) {
            if (!arguments.length) {
                return product;
            }
            if (x !== 'Data Generator') {
                throw new Error('Random Financial Data Generator does not support products.');
            }
            product = x;
            return dataGeneratorAdaptor;
        };

        dataGeneratorAdaptor.apiKey = function() {
            throw new Error('Not implemented.');
        };

        return dataGeneratorAdaptor;
    };

    var gdaxAdaptor = function() {
        var rateLimit = 1000;       // The GDAX API has a limit of 1 request per second

        var historicFeed = d3fcFinancialFeed.feedGdax(),
            candles;

        var gdaxAdaptor = debounce(function gdaxAdaptor(cb) {
            var startDate = d3.time.second.offset(historicFeed.end(), -candles * historicFeed.granularity());
            historicFeed.start(startDate);
            historicFeed(cb);
        }, rateLimit);

        gdaxAdaptor.candles = function(x) {
            if (!arguments.length) {
                return candles;
            }
            candles = x;
            return gdaxAdaptor;
        };

        gdaxAdaptor.apiKey = function() {
            throw new Error('Not implemented.');
        };

        d3.rebind(gdaxAdaptor, historicFeed, 'end', 'granularity', 'product');

        return gdaxAdaptor;
    };

    var gdaxHistoricErrorResponseFormatter = function(responseObject) {
        var message;
        if (responseObject) {
            message = responseObject.message;
        }
        return message;
    };

    /*global WebSocket */
    // https://docs.gdax.com/#websocket-feed

    var gdaxWebSocket = function() {

        var product = 'BTC-USD';
        var dispatch = d3.dispatch('open', 'close', 'error', 'message');
        var messageType = 'match';
        var socket;

        var webSocket = function(url, subscribe) {
            url = url || 'wss://ws-feed.gdax.com';
            subscribe = subscribe || {
                'type': 'subscribe',
                'product_id': product
            };

            socket = new WebSocket(url);

            socket.onopen = function(event) {
                socket.send(JSON.stringify(subscribe));
                dispatch.open(event);
            };
            socket.onerror = function(event) {
                dispatch.error(event);
            };
            socket.onclose = function(event) {
                dispatch.close(event);
            };
            socket.onmessage = function(event) {
                var msg = JSON.parse(event.data);
                if (msg.type === messageType) {
                    dispatch.message(msg);
                } else if (msg.type === 'error') {
                    dispatch.error(msg);
                }
            };
        };

        d3.rebind(webSocket, dispatch, 'on');

        webSocket.close = function() {
            // Only close the WebSocket if it is opening or open
            if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
                socket.close();
            }
        };

        webSocket.messageType = function(x) {
            if (!arguments.length) {
                return messageType;
            }
            messageType = x;
            return webSocket;
        };

        webSocket.product = function(x) {
            if (!arguments.length) {
                return product;
            }
            product = x;
            return webSocket;
        };

        return webSocket;
    };

    var quandlAdaptor = function() {

        var historicFeed = fc.data.feed.quandl()
                .database('WIKI')
                .columnNameMap(mapColumnNames),
            granularity,
            candles;

        // More options are allowed through the API; for now, only support daily and weekly
        var allowedPeriods = d3.map();
        allowedPeriods.set(60 * 60 * 24, 'daily');
        allowedPeriods.set(60 * 60 * 24 * 7, 'weekly');

        // Map fields for WIKI database, to use all adjusted values
        var columnNameMap = d3.map();
        columnNameMap.set('Open', 'unadjustedOpen');
        columnNameMap.set('High', 'unadjustedHigh');
        columnNameMap.set('Low', 'unadjustedLow');
        columnNameMap.set('Close', 'unadjustedClose');
        columnNameMap.set('Volume', 'unadjustedVolume');
        columnNameMap.set('Adj. Open', 'open');
        columnNameMap.set('Adj. High', 'high');
        columnNameMap.set('Adj. Low', 'low');
        columnNameMap.set('Adj. Close', 'close');
        columnNameMap.set('Adj. Volume', 'volume');

        function mapColumnNames(colName) {
            var mappedName = columnNameMap.get(colName);
            if (!mappedName) {
                mappedName = colName[0].toLowerCase() + colName.substr(1);
            }
            return mappedName;
        }

        function normaliseDataDateToStartOfDay(data) {
            return data.map(function(datum) {
                datum.date.setHours(0, 0, 0, 0);
                return datum;
            });
        }

        function quandlAdaptor(cb) {
            var startDate = d3.time.second.offset(historicFeed.end(), -candles * granularity);
            historicFeed.start(startDate)
                .collapse(allowedPeriods.get(granularity));

            historicFeed(function(err, data) {
                if (err) {
                    cb(err);
                } else {
                    var normalisedData = normaliseDataDateToStartOfDay(data);
                    cb(err, normalisedData);
                }
            });
        }

        quandlAdaptor.candles = function(x) {
            if (!arguments.length) {
                return candles;
            }
            candles = x;
            return quandlAdaptor;
        };

        quandlAdaptor.granularity = function(x) {
            if (!arguments.length) {
                return granularity;
            }
            // if (!allowedPeriods.has(x)) {
            //     throw new Error('Granularity of ' + x + ' is not supported.');
            // }
            granularity = x;
            return quandlAdaptor;
        };

        fcRebind.rebindAll(quandlAdaptor, historicFeed, fcRebind.includeMap({
            'end': 'end',
            'dataset': 'product',
            'apiKey': 'apiKey'
        }));

        return quandlAdaptor;
    };

    var quandlHistoricErrorResponseFormatter = function(responseObject) {
        var message;
        if (responseObject && responseObject.quandl_error) {
            message = responseObject.quandl_error.message;
        }
        return message;
    };

    // TODO: Temp until merged into d3fc
    var skipWeekendsDiscontinuityProvider = function() {
        var millisPerDay = 24 * 3600 * 1000;
        var millisPerWorkWeek = millisPerDay * 5;
        var millisPerWeek = millisPerDay * 7;

        var skipWeekends = {};

        function isWeekend(date) {
            return date.getDay() === 0 || date.getDay() === 6;
        }

        skipWeekends.clampDown = function(date) {
            if (date && isWeekend(date)) {
                var daysToSubtract = date.getDay() === 0 ? 2 : 1;
                // round the date up to midnight
                var newDate = d3.time.day.ceil(date);
                // then subtract the required number of days
                return d3.time.day.offset(newDate, -daysToSubtract);
            } else {
                return date;
            }
        };

        skipWeekends.clampUp = function(date) {
            if (date && isWeekend(date)) {
                var daysToAdd = date.getDay() === 0 ? 1 : 2;
                // round the date down to midnight
                var newDate = d3.time.day.floor(date);
                // then add the required number of days
                return d3.time.day.offset(newDate, daysToAdd);
            } else {
                return date;
            }
        };

        // returns the number of included milliseconds (i.e. those which do not fall)
        // within discontinuities, along this scale
        skipWeekends.distance = function(startDate, endDate) {
            startDate = skipWeekends.clampUp(startDate);
            endDate = skipWeekends.clampDown(endDate);

            // move the start date to the end of week boundary
            var offsetStart = d3.time.saturday.ceil(startDate);
            if (endDate < offsetStart) {
                return endDate.getTime() - startDate.getTime();
            }

            var msAdded = offsetStart.getTime() - startDate.getTime();

            // move the end date to the end of week boundary
            var offsetEnd = d3.time.saturday.ceil(endDate);
            var msRemoved = offsetEnd.getTime() - endDate.getTime();

            // determine how many weeks there are between these two dates
            var weeks = Math.round((offsetEnd.getTime() - offsetStart.getTime()) / millisPerWeek);

            return weeks * millisPerWorkWeek + msAdded - msRemoved;
        };

        skipWeekends.offset = function(startDate, ms) {
            var date = isWeekend(startDate) ? skipWeekends.clampUp(startDate) : startDate;
            var remainingms = ms;

            if (remainingms < 0) {
                var startOfWeek = d3.time.monday.floor(date);
                remainingms -= (startOfWeek.getTime() - date.getTime());

                if (remainingms >= 0) {
                    return new Date(date.getTime() + ms);
                }

                date = d3.time.day.offset(startOfWeek, -2);

                var weeks = Math.floor(remainingms / millisPerWorkWeek);
                date = d3.time.day.offset(date, weeks * 7);
                remainingms -= weeks * millisPerWorkWeek;

                date = new Date(date.getTime() + remainingms);
                date = d3.time.day.offset(date, 2);
                return date;
            } else {
                // move to the end of week boundary
                var endOfWeek = d3.time.saturday.ceil(date);
                remainingms -= (endOfWeek.getTime() - date.getTime());

                // if the distance to the boundary is greater than the number of ms
                // simply add the ms to the current date
                if (remainingms < 0) {
                    return new Date(date.getTime() + ms);
                }

                // skip the weekend
                date = d3.time.day.offset(endOfWeek, 2);

                // add all of the complete weeks to the date
                var completeWeeks = Math.floor(remainingms / millisPerWorkWeek);
                date = d3.time.day.offset(date, completeWeeks * 7);
                remainingms -= completeWeeks * millisPerWorkWeek;

                // add the remaining time
                date = new Date(date.getTime() + remainingms);
                return date;
            }
        };

        skipWeekends.copy = function() { return skipWeekends; };

        return skipWeekends;
    };

    var initialiseModel = function() {


        // default periods
        function initialisePeriods() {
            return {
                week1: model.data.period('Weekly', 60 * 60 * 24 * 7, {unit: d3.time.week, value: 1}, '%b %d'),
                day1: model.data.period('Daily', 60 * 60 * 24, {unit: d3.time.day, value: 1}, '%b %d'),
                hour1: model.data.period('1 Hr', 60 * 60, {unit: d3.time.hour, value: 1}, '%b %d %Hh'),
                minute5: model.data.period('5 Min', 60 * 5, {unit: d3.time.minute, value: 5}, '%H:%M'),
                minute1: model.data.period('1 Min', 60, {unit: d3.time.minute, value: 1}, '%H:%M')
            };
        }
        // periods
        var periods = initialisePeriods();
        var periodsAry = [periods.week1, periods.day1, periods.hour1, periods.minute5, periods.minute1];

        // default sources
        function initialiseSources() {
            return {
                generated: model.data.source(
                    dataGeneratorAdaptor(),
                    null,
                    null,
                    null,
                    fc.scale.discontinuity.identity()),
                bitcoin: model.data.source(
                    gdaxAdaptor(),
                    gdaxHistoricErrorResponseFormatter,
                    gdaxWebSocket(),
                    gdaxStreamingErrorResponseFormatter,
                    fc.scale.discontinuity.identity()),
                quandl: model.data.source(
                    quandlAdaptor(),
                    quandlHistoricErrorResponseFormatter,
                    null,
                    null,
                    skipWeekendsDiscontinuityProvider())
            };
        }
        // sources
        var sources = initialiseSources();

        // ----

        // default products
        function initialiseProducts() {
            return {
                // for demo
                // generated: model.data.product('Data Generator', 'Data Generator', [periods.day1], sources.generated, '.3s'),
                generated: model.data.product('Data Generator', 'Data Generator', periodsAry, sources.generated, '.3s'),
                // for quandl Stock data
                quandl: model.data.product('GOOG', 'GOOG', periodsAry, sources.quandl, '.3s')
                // quandl: model.data.product('GOOG', 'GOOG', [periods.day1], sources.quandl, '.3s')
            };
        }
        // products
        var products = initialiseProducts();

        // ----

        // series selector
        function initialiseSeriesSelector() {

            // candlestick
            var candlestick = candlestickSeries();
            candlestick.id = util.uid();

            var candlestickOption = model.menu.option('Candlestick', 'candlestick', candlestick, 'bf-icon-candlestick-series');
            candlestickOption.isSelected = true;
            candlestickOption.option.extentAccessor = ['high', 'low'];

            // ohlc
            var ohlc = fc.series.ohlc();
            ohlc.id = util.uid();
            var ohlcOption = model.menu.option('OHLC', 'ohlc', ohlc, 'bf-icon-ohlc-series');
            ohlcOption.option.extentAccessor = ['high', 'low'];

            // line
            var line = fc.series.line()
                .xValue(function(d) { return d.date; });
            line.id = util.uid();
            var lineOption = model.menu.option('Line', 'line', line, 'bf-icon-line-series');
            lineOption.option.extentAccessor = 'close';

            // point
            var point = fc.series.point()
                .xValue(function(d) { return d.date; });
            point.id = util.uid();
            var pointOption = model.menu.option('Point', 'point', point, 'bf-icon-point-series');
            pointOption.option.extentAccessor = 'close';

            // area
            var area = fc.series.area()
                .xValue(function(d) { return d.date; });
            area.id = util.uid();
            var areaOption = model.menu.option('Area', 'area', area, 'bf-icon-area-series');
            areaOption.option.extentAccessor = 'close';

            var config = model.menu.dropdownConfig(null, false, true, true); // dropdownConfig(title, careted, listIcons, icon)

            var options = [
                candlestickOption,
                ohlcOption,
                lineOption,
                pointOption,
                areaOption
            ];

            return model.menu.selector(config, options);
        }

        // indicator option
        function initialiseIndicatorOptions() {
            var secondary = chart$1.secondary;

            // Primary chart

            // movingAvera
            var movingAverage = fc.series.line()
                .decorate(function(select) {
                    select.enter()
                        .classed('movingAverage', true);
                })
                .xValue(function(d) { return d.date; })
                .yValue(function(d) { return d.movingAverage; });
            movingAverage.id = util.uid();

            var movingAverageOption = model.menu.option('Moving Average', 'movingAverage',
                movingAverage, 'bf-icon-moving-average-indicator', true);
            movingAverageOption.option.extentAccessor = function(d) { return d.movingAverage; };

            // bollingerBands
            var bollingerBands = fc.indicator.renderer.bollingerBands();
            bollingerBands.id = util.uid();

            var bollingerBandsOption = model.menu.option('Bollinger Bands', 'bollinger',
                bollingerBands, 'bf-icon-bollinger-bands-indicator', true);
            bollingerBandsOption.option.extentAccessor = [function(d) { return d.bollingerBands.lower; },
                function(d) { return d.bollingerBands.upper; }];

            // Secondary chart

            var rsi = secondary.rsi();
            rsi.id = util.uid();

            // MACD
            var macd = secondary.macd();
            macd.id = util.uid();

            // Volume
            var volume = secondary.volume();
            volume.id = util.uid();

            // indicarots Aray
            var indicators = [
                movingAverageOption,
                bollingerBandsOption,
                model.menu.option('Relative Strength Index', 'rsi',
                    rsi, 'bf-icon-rsi-indicator', false),
                model.menu.option('MACD', 'macd',
                    macd, 'bf-icon-macd-indicator', false),
                model.menu.option('Volume', 'volume',
                    volume, 'bf-icon-bar-series', false)
            ];

            return indicators;
        }

        // indicator selector
        function initialiseIndicatorSelector() {
            var config = model.menu.dropdownConfig('Add Indicator', false, true);

            return model.menu.selector(config, initialiseIndicatorOptions());
        }

        // selector
        function initialiseSelectors() {
            return {
                seriesSelector: initialiseSeriesSelector(),
                indicatorSelector: initialiseIndicatorSelector()
            };
        }

        // ----


        // charts
        function initialiseCharts() {

            // default settings
            // var defPeriod = periods.day1;
            var defPeriod = periods.minute1;
            var defGenerated = products.generated;
            var defProvider = products.generated.source.discontinuityProvider;

            // legend
            var legend = model.chart.legend(defGenerated, defPeriod);
            // default data product = data generated
            var nav = model.chart.nav(defProvider);
            var primary = model.chart.primary(defGenerated, defProvider);
            var secondary = model.chart.secondary(defGenerated, defProvider);
            // default xAxis = 1day
            var xAxis = model.chart.xAxis(defPeriod, defProvider);

            return model.chart.group(legend, nav, primary, secondary, xAxis);
        }


        // ----

        return {
            data: [],
            periods: periods,
            periodsAry: periodsAry,
            sources: sources,
            selectors: initialiseSelectors(),
            charts: initialiseCharts(),

            navReset: model.chart.navigationReset(),
            headMenu: model.menu.head([products.generated, products.quandl], products.generated, periods.day1),
            overlay: model.menu.overlay([products.generated, products.quandl], products.generated),
            notificationMessages: model.notification.messages()
        };
    };

    // Get products from GDAX api

    var getGdaxProducts = function(callback) {
        d3.json('https://api.gdax.com/products', function(error, response) {
            if (error) {
                callback(error);
                return;
            }
            callback(error, response);
        });
    };

    // format for GDAX produts json data

    var formatGdaxProducts = function(products, source, defaultPeriods, productPeriodOverrides) {
        return products.map(function(product) {
            return model.data.product(product.id, product.id,
                productPeriodOverrides.get(product.id) || defaultPeriods, source);
        });
    };

    /*global window */
    var app = function() {

        // depend on bootstrap
        var appTemplateWithSelector = '<div class="container-fluid"> \
        <div id="notifications"></div> \
        <div id="loading-status-message"></div> \
        <div class="row head-menu head-row"> \
            <div class="col-md-12 head-sub-row"> \
                <div id="product-dropdown" class="dropdown product-dropdown"></div> \
                <div class="selectors"> \
                    <div class="series-dropdown dropdown selector-dropdown"></div> \
                    <div class="indicator-dropdown dropdown selector-dropdown"></div> \
                    <div id="mobile-period-selector" class="dropdown"></div> \
                </div> \
                <div id="period-selector"></div> \
                <span id="clear-indicators" class="icon bf-icon-delete delete-button"></span> \
            </div> \
        </div> \
        <div class="row primary-row"> \
            <div id="charts" class="col-md-12"> \
                <div id="charts-container"> \
                    <svg id="primary-container"></svg> \
                    <div id="secondaries-container"></div> \
                    <div class="x-axis-row"> \
                        <svg id="x-axis-container"></svg> \
                    </div> \
                    <div id="navbar-row"> \
                        <svg id="navbar-container"></svg> \
                        <svg id="navbar-reset"></svg> \
                    </div> \
                </div> \
                <div id="overlay"> \
                    <div id="overlay-primary-container"> \
                        <div id="overlay-primary-head"> \
                            <div class="selectors"> \
                                <div id="mobile-product-dropdown" class="dropdown"></div> \
                                <div class="series-dropdown dropdown selector-dropdown"></div> \
                                <div class="indicator-dropdown dropdown selector-dropdown"></div> \
                            </div> \
                            <div id="legend"> \
                                <svg id="tooltip"></svg> \
                            </div> \
                        </div> \
                        <div id="overlay-primary-bottom"> \
                            <div class="edit-indicator-container"></div> \
                        </div> \
                    </div> \
                    <div id="overlay-secondaries-container"></div> \
                    <div class="x-axis-row"></div> \
                    <div id="overlay-navbar-row"></div> \
                </div> \
            </div> \
        </div> \
    </div>';

        // // no bootstrap
        // var appTemplate = '<div class="container-fluid"> \
        //     <div id="notifications"></div> \
        //     <div id="loading-status-message"></div> \
        //     <div class="head-menu head-row"> \
        //         <div class="head-sub-row"> \
        //         </div> \
        //     </div> \
        //     <div class="row primary-row"> \
        //         <div id="charts"> \
        //             <div id="charts-container"> \
        //                 <svg id="primary-container"></svg> \
        //                 <div id="secondaries-container"></div> \
        //                 <div class="x-axis-row"> \
        //                     <svg id="x-axis-container"></svg> \
        //                 </div> \
        //                 <div id="navbar-row"> \
        //                     <svg id="navbar-container"></svg> \
        //                     <svg id="navbar-reset"></svg> \
        //                 </div> \
        //             </div> \
        //             <div id="overlay"> \
        //                 <div id="overlay-primary-container"> \
        //                     <div id="overlay-primary-head"> \
        //                         <div id="legend"> \
        //                             <svg id="tooltip"></svg> \
        //                         </div> \
        //                     </div> \
        //                     <div id="overlay-primary-bottom"> \
        //                         <div class="edit-indicator-container"></div> \
        //                     </div> \
        //                 </div> \
        //                 <div id="overlay-secondaries-container"></div> \
        //                 <div class="x-axis-row"></div> \
        //                 <div id="overlay-navbar-row"></div> \
        //             </div> \
        //         </div> \
        //     </div> \
        // </div>';

        var app = {};

        var containers;

        var model = initialiseModel();

        var _dataInterface = initialiseDataInterface();
        var charts = initialiseCharts();

        var externalHistoricFeedErrorCallback;

        var overlay;
        var headMenu;
        var navReset;
        var selectors;
        var toastNotifications;

        // var selectedProductString;
        // var afterAddGdaxProductsCallBack;

        var displaySelector = true;
        var fetchGdaxProducts = false;

        var proportionOfDataToDisplayByDefault = 0.2;

        var firstRender = true;
        function renderInternal() {
            if (firstRender) {
                firstRender = false;
            }
            if (layoutRedrawnInNextRender) {
                containers.suspendLayout(false);
            }

            containers.chartsAndOverlay.datum(model.charts)
                .call(charts);

            containers.app.select('#navbar-reset')
                .datum(model.navReset)
                .call(navReset);

            if (displaySelector) {
                containers.app.select('.head-menu')
                    .datum(model.headMenu)
                    .call(headMenu);

                containers.app.selectAll('.selectors')
                    .datum(model.selectors)
                    .call(selectors);
            }

            containers.app.select('#notifications')
                .datum(model.notificationMessages)
                .call(toastNotifications);

            containers.overlay.datum(model.overlay)
                .call(overlay, displaySelector);

            if (layoutRedrawnInNextRender) {
                containers.suspendLayout(true);
                layoutRedrawnInNextRender = false;
            }
        }

        var render = fc.util.render(renderInternal);

        var layoutRedrawnInNextRender = true;

        function updateLayout() {
            layoutRedrawnInNextRender = true;
            util.layout(containers, charts, displaySelector);
        }

        function initialiseResize() {
            d3.select(window).on('resize', function() {
                updateLayout();
                render();
            });
        }

        function addNotification(message$$1) {
            model.notificationMessages.messages.unshift(message(message$$1));
        }

        //
        function onViewChange(domain) {
            var viewDomain = [domain[0], domain[1]];
            model.charts.primary.viewDomain = viewDomain;
            model.charts.secondary.viewDomain = viewDomain;
            model.charts.xAxis.viewDomain = viewDomain;
            model.charts.nav.viewDomain = viewDomain;

            var visibleData = util.domain.filterDataInDateRange(viewDomain, model.data);
            model.charts.primary.visibleData = visibleData;
            model.charts.secondary.visibleData = visibleData;

            var trackingLatest = util.domain.trackingLatestData(
                model.charts.primary.viewDomain,
                model.charts.primary.data);
            model.charts.primary.trackingLatest = trackingLatest;
            model.charts.secondary.trackingLatest = trackingLatest;
            model.charts.nav.trackingLatest = trackingLatest;
            model.navReset.trackingLatest = trackingLatest;
            render();
        }

        function onPrimaryIndicatorChange(indicator) {
            indicator.isSelected = !indicator.isSelected;
            updatePrimaryChartIndicators();
            render();
        }

        function onSecondaryChartChange(_chart) {
            _chart.isSelected = !_chart.isSelected;
            updateSecondaryCharts();
            render();
        }

        // mouse pointer for legend
        function onCrosshairChange(dataPoint) {
            model.charts.legend.data = dataPoint;
            render();
        }

        function onStreamingFeedCloseOrError(streamingEvent, source) {
            var message$$1;
            if (source.streamingNotificationFormatter) {
                message$$1 = source.streamingNotificationFormatter(streamingEvent);
            } else {
                // #515 (https://github.com/ScottLogic/BitFlux/issues/515)
                // (TODO) prevents errors when formatting streaming close/error messages when product changes.
                // As we only have a GDAX streaming source at the moment, this is a suitable fix for now
                message$$1 = gdaxStreamingErrorResponseFormatter(streamingEvent);
            }
            if (message$$1) {
                addNotification(message$$1);
                render();
            }
        }

        function resetToLatest() {
            var data$$1 = model.charts.primary.data;
            var dataDomain = fc.util.extent()
                .fields(['date'])(data$$1);

            var navTimeDomain = util.domain.moveToLatest(
                model.charts.primary.discontinuityProvider,
                dataDomain,
                dataDomain,
                proportionOfDataToDisplayByDefault); // todo: defaultでなくNavチャートのスライダーで変更した値をセットする。

            onViewChange(navTimeDomain);
        }

        function loading(isLoading, error) {
            var spinner = '<div class="spinner"></div>';
            var obscure = arguments.length > 1 || isLoading;

            var errorMessage = '';
            if (error && error.length) {
                errorMessage = '<div class="content alert alert-info">' + error + '</div>';
            }
            containers.app.select('#loading-status-message')
                .classed('hidden', !obscure)
                .html(error ? errorMessage : spinner);
        }

        // --------------

        function updateModelData(data$$1) {
            model.data = data$$1;
            model.charts.primary.data = data$$1;
            model.charts.secondary.data = data$$1;
            model.charts.nav.data = data$$1;
        }

        function updateDiscontinuityProvider(productSource) {
            var discontinuityProvider = productSource.discontinuityProvider;

            model.charts.xAxis.discontinuityProvider = discontinuityProvider;
            model.charts.nav.discontinuityProvider = discontinuityProvider;
            model.charts.primary.discontinuityProvider = discontinuityProvider;
            model.charts.secondary.discontinuityProvider = discontinuityProvider;
        }

        function updateModelSelectedProduct(product) {
            model.headMenu.selectedProduct = product;
            model.overlay.selectedProduct = product;
            model.charts.primary.product = product;
            model.charts.secondary.product = product;
            model.charts.legend.product = product;

            updateDiscontinuityProvider(product.source);
        }

        // todo:period
        function updateModelSelectedPeriod(period) {
            model.headMenu.selectedPeriod = period;
            model.charts.xAxis.period = period;
            model.charts.legend.period = period;
        }

        // --------------

        function changeProduct(product, period) {
            loading(true);
            updateModelSelectedProduct(product);

            // todo:Period 現在の選択されている periodをセットする。
            let p;
            if (!period) {
                p = product.periods[0];
            } else {
                p = model.periods[period];
            }
            updateModelSelectedPeriod(p);
            _dataInterface(p.seconds, product);
        }

        function initialiseCharts() {
            return group()
                .on(event.crosshairChange, onCrosshairChange)
                .on(event.viewChange, onViewChange);
        }

        function initialiseNavReset() {
            return menu.navigationReset()
                .on(event.resetToLatest, resetToLatest);
        }

        // --------------

        function initialiseDataInterface() {
            return dataInterface()
                .on(event.newTrade, function(data$$1) {
                    updateModelData(data$$1);
                    if (model.charts.primary.trackingLatest) {
                        var newDomain = util.domain.moveToLatest(
                            model.charts.primary.discontinuityProvider,
                            model.charts.primary.viewDomain,
                            fc.util.extent().fields(['date'])(model.charts.primary.data));
                        onViewChange(newDomain);
                    }
                })
                .on(event.historicDataLoaded, function(data$$1) {
                    loading(false);
                    updateModelData(data$$1);
                    model.charts.legend.data = null;
                    resetToLatest();
                    updateLayout();
                })
                .on(event.historicFeedError, function(err, source) {
                    if (externalHistoricFeedErrorCallback) {
                        var error = externalHistoricFeedErrorCallback(err) || true;
                        loading(false, error);
                    } else {
                        loading(false, 'Error loading data. Please make your selection again, or refresh the page.');
                        var responseText = '';
                        try {
                            var responseObject = JSON.parse(err.responseText);
                            var formattedMessage = source.historicNotificationFormatter(responseObject);
                            if (formattedMessage) {
                                responseText = '. ' + formattedMessage;
                            }
                        } catch (e) {
                            responseText = '';
                        }
                        var statusText = err.statusText || 'Unknown reason.';
                        var message$$1 = 'Error getting historic data: ' + statusText + responseText;

                        addNotification(message$$1);
                    }
                    render();
                })
                .on(event.streamingFeedError, onStreamingFeedCloseOrError)
                .on(event.streamingFeedClose, onStreamingFeedCloseOrError);
        }

        // head menu 初期化
        function initialiseHeadMenu() {
            return menu.head()
                .on(event.dataProductChange, function(product) {
                    changeProduct(product.option);
                    render();
                })
                .on(event.dataPeriodChange, function(period) {
                    loading(true);
                    updateModelSelectedPeriod(period.option);
                    _dataInterface(period.option.seconds);
                    render();
                })
                .on(event.clearAllPrimaryChartIndicatorsAndSecondaryCharts, function() {
                    model.charts.primary.indicators.forEach(deselectOption);
                    model.charts.secondary.indicators.forEach(deselectOption);

                    updatePrimaryChartIndicators();
                    updateSecondaryCharts();
                    render();
                });
        }

        function selectOption(option, options) {
            options.forEach(function(_option) {
                _option.isSelected = false;
            });
            option.isSelected = true;
        }

        function deselectOption(option) { option.isSelected = false; }

        function initialiseSelectors() {
            return menu.selectors()
                .on(event.primaryChartSeriesChange, function(series) {
                    model.charts.primary.series = series;
                    selectOption(series, model.selectors.seriesSelector.options);
                    render();
                })
                .on(event.primaryChartIndicatorChange, onPrimaryIndicatorChange)
                .on(event.secondaryChartChange, onSecondaryChartChange);
        }

        function updatePrimaryChartIndicators() {
            model.charts.primary.indicators =
                model.selectors.indicatorSelector.options.filter(function(option) {
                    return option.isSelected && option.isPrimary;
                });

            model.overlay.primaryIndicators = model.charts.primary.indicators;
            model.headMenu.primaryIndicators = model.charts.primary.indicators;
        }

        // secondary chart
        function updateSecondaryChartModels() {
            model.charts.secondary.indicators = model.selectors.indicatorSelector.options.filter(function(option) {
                return option.isSelected && !option.isPrimary;
            });

            charts.secondaries().charts(model.charts.secondary.indicators.map(function(indicator) {
                return indicator;
            }));

            //
            model.overlay.secondaryIndicators = model.charts.secondary.indicators;
            model.headMenu.secondaryIndicators = model.charts.secondary.indicators;
        }

        function updateSecondaryCharts() {
            updateSecondaryChartModels();
            updateLayout();
        }

        function initialiseOverlay() {
            return menu.overlay()
                .on(event.primaryChartIndicatorChange, onPrimaryIndicatorChange)
                .on(event.secondaryChartChange, onSecondaryChartChange)
                .on(event.dataProductChange, function(product) {
                    changeProduct(product.option);
                    render();
                });
        }

        function onNotificationClose(id) {
            model.notificationMessages.messages = model.notificationMessages.messages.filter(function(message$$1) { return message$$1.id !== id; });
            render();
        }

        function initialiseNotifications() {
            return notification.toast()
                .on(event.notificationClose, onNotificationClose);
        }

        // -----------
        // GDAX (bitcoin)
        // -----------
        // proc for receive GDAX products json file
        var gdaxProducts;
        function addGdaxProducts(error, bitcoinProducts) {
            if (error) {
                var statusText = error.statusText || 'Unknown reason.';
                var message$$1 = 'Error retrieving GDAX products: ' + statusText;
                model.notificationMessages.messages.unshift(message(message$$1));
            } else {
                // parameter for format
                // var defaultPeriods = [model.periods.hour1, model.periods.day1];
                var defaultPeriods = model.periodsAry;
                var productPeriodOverrides = d3.map();
                // productPeriodOverrides.set('BTC-USD', [model.periods.minute1, model.periods.minute5, model.periods.hour1, model.periods.day1]);

                // data format
                var formattedProducts = formatGdaxProducts(bitcoinProducts, model.sources.bitcoin, defaultPeriods, productPeriodOverrides);

                // memory GdaxProducts
                gdaxProducts = formattedProducts;

                // add to headMenu
                model.headMenu.products = model.headMenu.products.concat(formattedProducts);
                // add to overlay
                model.overlay.products = model.headMenu.products;
            }

            render();
        }

        // GDAX product switch
        // argument x : true (display bitcoin product)
        // default : false
        app.fetchGdaxProducts = function(x) {
            if (!arguments.length) {
                return fetchGdaxProducts;
            }
            fetchGdaxProducts = x;
            return app;
        };

        // -----------
        // Quandle (stock)
        // -----------
        // Change Quandle stock product
        // If no exist product Add
        // default : 'GOOG'
        // execute after app.run()
        // argument  ticker  ex : 'MSFT'
        app.changeQuandlProduct = function(productString, periodString) {
            var product = data.product(productString, productString, model.periodsAry, model.sources.quandl, '.3s');
            // var product = dataModel.product(productString, productString, [model.periods.day1], model.sources.quandl, '.3s');

            var existsInHeadMenuProducts = model.headMenu.products.some(function(p) { return p.id === product.id; });
            var existsInOverlayProducts = model.overlay.products.some(function(p) { return p.id === product.id; });

            if (!existsInHeadMenuProducts) {
                model.headMenu.products.push(product);
            }

            if (!existsInOverlayProducts) {
                model.overlay.products.push(product);
            }

            changeProduct(product, periodString);

            if (!firstRender) {
                render();
            }
            return app;
        };

        // set default xAxis dispay range rate
        // x : 0 - 1
        // execute befor app.run()
        app.proportionOfDataToDisplayByDefault = function(x) {
            if (!arguments.length) {
                return proportionOfDataToDisplayByDefault;
            }
            proportionOfDataToDisplayByDefault = x;
            return app;
        };

        //
        app.historicFeedErrorCallback = function(x) {
            if (!arguments.length) {
                return externalHistoricFeedErrorCallback;
            }
            externalHistoricFeedErrorCallback = x;
            return app;
        };

        // select indicators
        // default : non
        // execute after app.run()
        // argument : ['madc','' ... ]
        // no argument : retunr current selected indicators ary
        app.indicators = function(x) {
            if (!arguments.length) {
                var indicators = [];
                model.selectors.indicatorSelector.options.forEach(function(option) {
                    if (option.isSelected) {
                        indicators.push(option.valueString);
                    }
                });
                return indicators;
            }

            model.selectors.indicatorSelector.options.forEach(function(indicator) {
                indicator.isSelected = x.some(function(indicatorValueStringToShow) { return indicatorValueStringToShow === indicator.valueString; });
            });

            updatePrimaryChartIndicators();
            // updateSecondaryCharts();
            // render();

            if (!firstRender) {
                updateSecondaryCharts();
                render();
            } else {
                updateSecondaryChartModels();
            }

            return app;
        };

        // run
        app.run = function(element) {
            if (!element) {
                throw new Error('An element must be specified when running the application.');
            }

            // init container

            var appContainer = d3.select(element);

            if (displaySelector) {
                appContainer.html(appTemplateWithSelector);
            } else {
                appContainer.html(appTemplateWithSelector);
            }

            var chartsAndOverlayContainer = appContainer.select('#charts');
            var chartsContainer = appContainer.select('#charts-container');
            var overlayContainer = appContainer.select('#overlay');

            // set containers
            containers = {
                app: appContainer,
                charts: chartsContainer,
                chartsAndOverlay: chartsAndOverlayContainer,
                primary: chartsContainer.select('#primary-container'),
                secondaries: chartsContainer.select('#secondaries-container'),
                xAxis: chartsContainer.select('#x-axis-container'),
                navbar: chartsContainer.select('#navbar-container'),
                overlay: overlayContainer,
                overlaySecondaries: overlayContainer.select('#overlay-secondaries-container'),
                legend: appContainer.select('#legend'),
                suspendLayout: function(value) {
                    var self = this;
                    Object.keys(self).forEach(function(key) {
                        if (typeof self[key] !== 'function') {
                            self[key].layoutSuspended(value);
                        }
                    });
                }
            };

            // init selector
            if (displaySelector) {
                headMenu = initialiseHeadMenu();
                selectors = initialiseSelectors();
            }

            navReset = initialiseNavReset();
            overlay = initialiseOverlay();
            toastNotifications = initialiseNotifications();

            //
            updateLayout();
            // set windows resize event
            initialiseResize();

            // data interface
            _dataInterface(model.headMenu.selectedPeriod.seconds, model.headMenu.selectedProduct);

            if (fetchGdaxProducts) {
                // get products from gdax api
                getGdaxProducts(addGdaxProducts);
            } else if (model.sources.bitcoin) {
                // delete bitcoin source from model
                delete model.sources.bitcoin;
            }

            return app;
        };

        fcRebind.rebindAll(app, model.sources.quandl.historicFeed, fcRebind.includeMap({
            'apiKey': 'quandlApiKey'
        }));

        fcRebind.rebindAll(app, _dataInterface, fcRebind.includeMap({
            'candlesOfData': 'periodsOfDataToFetch'
        }));

        // ------------------
        //
        app.changeSeries = function(seriesString) {

            var options = model.selectors.seriesSelector.options;

            var series;
            var existsInSeriesSelectorOptions = options.some(function(p) {
                series = p;
                return p.valueString === seriesString;
            });
            if (!existsInSeriesSelectorOptions) {
                return app;
            }

            model.charts.primary.series = series;
            selectOption(series, options);

            if (!firstRender) {
                render();
            }
            return app;
        };

        // temporaly not work
        // app.displaySelector = function(x) {
        //     if (!arguments.length) {
        //         // todo:error
        //         return app;
        //     }
        //     displaySelector = x;
        //     return app;
        // };

        //
        app.changeProduct = function(productString, periodString) {

            var product;
            var existsInOverlayProducts = model.overlay.products.some(function(p) {
                product = p;
                return p.id === productString;
            });
            if (!existsInOverlayProducts) {
                // todo:error
                return app;
            }

            var existsInHeadMenuProducts = model.headMenu.products.some(function(p) {
                product = p;
                return p.id === productString;
            });
            if (!existsInHeadMenuProducts) {
                return app;
            }

            changeProduct(product, periodString);

            if (!firstRender) {
                render();
            }

            // selectedProductString = productString;
            // afterAddGdaxProductsCallBack = function() {

            //     var product;
            //     var existsInHeadMenuProducts = model.headMenu.products.some(function(p) {
            //         product = p;
            //         return p.id === selectedProductString;
            //     });
            //     if (existsInHeadMenuProducts) {
            //         changeProduct(product);
            //     }
            // };

            return app;
        };

        app.getGdaxProducts = function() {

            return gdaxProducts;

        };

        // app.changePeriod = function(productString, periodString) {


        //     var product;
        //     // var existsInOverlayProducts = model.overlay.products.some(function(p) {
        //     //     product = p;
        //     //     return p.id === productString;
        //     // });
        //     // if (!existsInOverlayProducts) {
        //     //     // todo:error
        //     //     return app;
        //     // }
        //     var existsInHeadMenuProducts = model.headMenu.products.some(function(p) {
        //         product = p;
        //         return p.id === productString;
        //     });
        //     if (!existsInHeadMenuProducts) {
        //         return app;
        //     }

        //     const period = model.periods[periodString];

        //     updateModelSelectedPeriod(period);
        //     _dataInterface(period.seconds, product);

        //     return app;

        // };

        // ------------------

        return app;
    };

    var BitFlux = {
        app: app
    };

    /*global window */
    // A query string (?seed=) can be added to the URL
    // to seed the random number generator.
    // For example: ?seed=yourseed
    // var seed = window.location.search.split('seed=')[1];

    // if (seed) {
    //     Math.seedrandom(seed);
    // }

    // var bfapp = BitFlux.app()
    //     .fetchGdaxProducts(true)
    //     .proportionOfDataToDisplayByDefault(1)
    //     .run('#app-container');

    // bfapp.changeQuandlProduct('MSFT')
    //     .changeSeries('ohlc')
    //     .indicators(['macd']);

    // bfapp.indicators([]);

    window.BitFluxS = BitFlux;

})));

//# sourceMappingURL=app.js.map