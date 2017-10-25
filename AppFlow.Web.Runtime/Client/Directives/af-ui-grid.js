(function () {
    angular.module('appflow.controls.viewGrid', ['ui.grid'])
        .directive('afUiGrid', Directive)
        .provider('pagerHelper', PagerHelper);

    function PagerHelper() {
        var provider = {
            $get: ['instancesViewFactory', function (instancesViewFactory) {
                var providerInstance = {
                    maxItemCount: 100,
                    totalItemsCount: 0,
                    retryCount: 0,
                    pageNumber: 1,
                    pageSize: 25,
                    minThreshold: 0,
                    maxThreshold: 0,
                    min: 0,
                    max: 0,
                    tokens: [],
                    filterExpression: '',
                    allTokensLoaded: false,
                    sort: null,
                    direction: 'next',
                    lastDataLength: 0,
                    data: [],
                    subscriptionId: null,
                    applicationId: null,
                    viewId: null,
                    fields: [],
                    // private methods
                    _addToken: function (continuationToken, initial, final) {
                        var token = _.findWhere(this.tokens, { ContinuationToken: continuationToken });
                        if (!token) {
                            this.tokens.push({
                                ContinuationToken: continuationToken,
                                Initial: initial,
                                Final: final
                            });
                        }
                    },
                    _getCurrentToken: function () {
                        var pageItemsCount = this.pageNumber * this.pageSize;
                        // evaluate if pageItemsCount is the last page and is gt totalItemsCount
                        pageItemsCount = pageItemsCount > this.totalItemsCount ? this.totalItemsCount : pageItemsCount;
                        var result = _.find(this.tokens, function (token) {
                            return pageItemsCount >= token.Initial && pageItemsCount <= token.Final;
                        });

                        return result;
                    },
                    _resolveNextContinuationToken: function () {
                        var currentToken = this._getCurrentToken();

                        var currentTokenIndex = _.indexOf(this.tokens, currentToken);

                        return this.direction === 'next'
                            ? this.tokens[currentTokenIndex].ContinuationToken : currentTokenIndex - 1 === 0
                            ? "null" : currentTokenIndex === 0
                            ? null : this.tokens[currentTokenIndex - 2].ContinuationToken;
                    },
                    _getNextToken: function () {
                        var currentToken = this._getCurrentToken();

                        var currentTokenIndex = _.indexOf(this.tokens, currentToken);

                        return this.direction === 'next' ? this.tokens[currentTokenIndex] : this.tokens[currentTokenIndex - 2];
                    },
                    _resolveMinMax: function () {
                        var currentToken = this._getCurrentToken();
                        currentToken = _.isUndefined(currentToken) ? this.tokens[0] : currentToken;
                        var currentTokenIndex = _.indexOf(this.tokens, currentToken);

                        var nextToken = this.direction === 'next' ? this.tokens[currentTokenIndex + 1] : this.tokens[currentTokenIndex - 1];
                        nextToken = !nextToken ? currentToken : nextToken;
                        if (this.direction === 'next') {
                            this.min = currentToken.Initial;
                            this.max = nextToken.Final;
                        }
                        else {
                            this.min = nextToken.Initial;
                            this.max = currentToken.Final;
                        }

                    },
                    _calculateGridDataRange: function () {
                        var start = this.min > 1 ? ((this.pageNumber - 1) * this.pageSize) - this.min : ((this.pageNumber - 1) * this.pageSize);
                        start = start === -1 ? 0 : start;
                        var end = start === 0 ? 25 : start + this.pageSize;

                        return {
                            start: start,
                            end: end
                        };
                    },
                    _getGridData: function () {
                        var range = this._calculateGridDataRange();
                        return this.data.slice(range.start, range.end);
                    },
                    _appendData: function (data) {
                        this.data = this.direction === 'next'
                            ? this.data.concat(data)
                            : data.concat(this.data);
                    },
                    _trimData: function () {
                        if (this.tokens.length > 2) {
                            this.data = this.direction === 'next'
                                ? this.data.slice(this.data.length == 300 ? this.tokens[0].Final + 1 : this.tokens[0].Final, this.max)
                                : this.data.slice(0, 1000);
                        }
                    },
                    _resolveThreshold: function (continuationToken) {
                        var _maxThreshold = this.maxThreshold;
                        var _minThreshold = this.minThreshold;
                        if (continuationToken) {
                            this.maxThreshold = this.direction === 'next'
                               ? Math.floor((this.max / this.pageSize)) - 1
                                   : _minThreshold + 1;
                        }
                        this.minThreshold = this.direction === 'next'
                                ? _maxThreshold - 1
                                : Math.floor((this.min / this.pageSize)) + 1
                    },
                    _handleData: function (response, callback) {
                        var data;
                        if (response.Data) {
                            this.lastDataLength = response.Data.length;
                            var initial = this.pageNumber === 1 ? this.pageNumber : this.max + 1;
                            var final = response.Data.length + this.max;
                            this._addToken(response.ContinuationToken, initial, final);
                            this._resolveMinMax();
                            this._appendData(response.Data);
                            this._trimData();
                            this._resolveThreshold(response.ContinuationToken);
                            data = this._getGridData();
                            if (callback) {
                                callback(data);
                            }
                        }
                    },
                    _getInstancesDataFilter: function (continuationToken, maxItemCount, callback) {
                        instancesViewFactory.getInstancesDataFilter(this.subscriptionId, this.applicationId, this.fields, this.filterExpression, continuationToken, maxItemCount)
                            .success(function (response) {
                                providerInstance._handleData(response, callback);
                            }).error(function () {
                                if (this.retryCount <= 3) {
                                    providerInstance._getInstancesDataFilter(providerInstance.subscriptionId, providerInstance.applicationId, providerInstance.fields,
                                        continuationToken, maxItemCount, callback);
                                }

                                this.retryCount++;
                            })
                        ;
                    },
                    _getAllContinuationTokens: function (maxItemCount, callback) {
                        instancesViewFactory.getAllContinuationTokens(this.subscriptionId, this.applicationId, this.fields, this.filterExpression, '', maxItemCount)
                          .success(function (response) {
                              if (callback) {
                                  callback(response);
                              }
                          });
                    },
                    _navigateStraight: function (callback) {
                        var data = this._getGridData();
                        if (callback) {
                            callback(data);
                        }

                        var loadNextDataset = this.direction === 'next' ? this.pageNumber === this.maxThreshold : this.pageNumber === this.minThreshold;
                        if (loadNextDataset) {
                            var continuationToken = this._resolveNextContinuationToken()
                            if (continuationToken !== null) {
                                this._getInstancesDataFilter(continuationToken, this.maxItemCount);
                            }
                        }
                    },
                    _navigateByJump: function (callback) {
                        if (this._pageIsOnMemory()) {
                            this._navigateStraight(callback)
                        }
                        else {
                            if (this.allTokensLoaded) {
                                this.data = [];
                                var currentToken = this._getCurrentToken();
                                var currentTokenIndex = _.indexOf(this.tokens, currentToken);
                                var continuationToken = currentToken.Initial === 1 ? null : this.tokens[currentTokenIndex - 1].ContinuationToken;
                                if (currentToken) {
                                    this._getInstancesDataFilter(continuationToken, this.maxItemCount, callback);
                                }
                            }
                            else {
                                // TODO feedback grid
                            }
                        }
                    },
                    _pageIsOnMemory: function () {
                        var maxItemsPage = this.pageNumber * this.pageSize;
                        return this.min <= maxItemsPage && maxItemsPage <= this.max;
                    },
                    // public methods
                    initialize: function (options, callback) {
                        var provider = this;
                        provider.subscriptionId = options.subscriptionId;
                        provider.applicationId = options.applicationId;
                        provider.fields = options.fields;
                        provider.viewId = options.viewId;
                        provider.filterExpression = resolveFilterExpression(options);
                        provider.pageNumber = _.isNull(options.pageNumber) || _.isUndefined(options.pageNumber) ? 1 : options.pageNumber;
                        var continuationToken = null;
                        if (!_.isNull(options.tokens) && !_.isUndefined(options.tokens)) {
                            this.tokens = options.tokens;
                            var currentToken = this._getCurrentToken();
                            this.max = currentToken.Final;
                            this.min = currentToken.Initial;
                            continuationToken = currentToken.ContinuationToken;
                        }

                        provider._getInstancesDataFilter(continuationToken, 100, function (response) {
                            if (callback) {
                                callback(response);
                            }
                        });
                    },
                    calculateDirection: function (newPage) {
                        this.direction = (newPage > this.pageNumber) ? "next" : "back";
                    },
                    loadPage: function (newPage, callback) {
                        var jump = this.direction === 'next' ? (newPage > this.pageNumber + 1) : newPage < this.pageNumber - 1;
                        this.pageNumber = newPage;
                        jump ? this._navigateByJump(callback) : this._navigateStraight(callback);
                    },
                    reset: function () {
                        this.pageNumber = 1;
                        this.pageSize = 25;
                        this.minThreshold = 0;
                        this.maxThreshold = 0;
                        this.min = 0;
                        this.max = 0;
                        this.tokens = [];
                        this.sort = null;
                        this.direction = 'next';
                        this.data = [];
                    },
                    updateData: function (data, continuationToken, callback) {
                        this.reset();
                        this._handleData({
                            Data: data, ContinuationToken: continuationToken
                        }, callback);
                    }
                };

                return providerInstance;
            }]
        };

        return provider;
    }

    function resolveFilterExpression(options) {
        if (!options.userFilterExpression) {
            return options.filterExpression;
        }
        else {
            if (options.filterExpression != null) {
                return options.filterExpression + ' && ' + options.userFilterExpression;
            }
            else {
                return options.userFilterExpression;
            }
        }
    }

    function Directive() {
        controller.$inject = [
            '$rootScope',
            '$scope',
            '$uibModal',
            '$state',
            '$timeout',
            '$stateParams',
            'uiGridConstants',
            'uiGridGroupingConstants',
            '$runtimeApi',
            'instancesViewFactory',
            'Notification',
            'pagerHelper',
            '$filter',
            'LoaderHistory',
            'uiGridExporterService',
            'uiGridExporterConstants',
            '_afBusyFactory'
        ];

        function controller(
            $rootScope,
            $scope,
            $modal,
            $state,
            $timeout,
            $stateParams,
            uiGridConstants,
            uiGridGroupingConstants,
            $runtimeApi,
            instancesViewFactory,
            Notification,
            pagerHelper,
            $filter,
            LoaderHistory,
            uiGridExporterService,
            uiGridExporterConstants,
            _afBusyFactory
        ) {
            var vm = this;
            vm.paginationLoaded = false;
            var uiGridControl = {
                //resizeHeight: function (value) {
                //    vm.gridheight = value;
                //    vm.gridApi.core.refresh();
                //}
            };

            $scope.$on('updateTotalInstaceCount', function (event, args) {
                vm.gridOptions.totalItems = args.totalInstanceCount;
                pagerHelper.totalItemsCount = args.totalInstanceCount;
                if ($stateParams.CurrentPage != null) {
                    if ($stateParams.CurrentPage != vm.gridOptions.paginationCurrentPage) {
                        vm.gridOptions.paginationCurrentPage = $stateParams.CurrentPage;
                        vm.paginationLoaded = true;
                    }
                    else {
                        $stateParams.CurrentPage = null;
                        $stateParams.Tokens = null;
                    }
                }
                else {
                    vm.finalItemsCount = vm.gridOptions.data.length;
                }
            });

            $rootScope.$on('ExportDocument', function (event, args) {
                var rowsSelected = vm.gridApi.selection.getSelectedRows();
                var countRows = rowsSelected.length;
                switch (args.type) {
                    case 'csv':
                        var grid = vm.gridApi.grid;
                        var rowTypes = countRows > 0 ? uiGridExporterConstants.SELECTED : uiGridExporterConstants.ALL;
                        var colTypes = countRows > 0 ? uiGridExporterConstants.SELECTED : uiGridExporterConstants.ALL;
                        uiGridExporterService.csvExport(grid, rowTypes, colTypes);
                        break;
                    case 'pdf':
                        var grid = vm.gridApi.grid;
                        var rowTypes = countRows > 0 ? uiGridExporterConstants.SELECTED : uiGridExporterConstants.ALL;
                        var colTypes = countRows > 0 ? uiGridExporterConstants.SELECTED : uiGridExporterConstants.ALL;
                        uiGridExporterService.pdfExport(grid, rowTypes, colTypes);
                        break;
                    case 'xml':
                        //TODO XML exporter
                        break;

                }
                vm.gridOptions.totalItems = args.totalInstanceCount;
                pagerHelper.totalItemsCount = args.totalInstanceCount;
            });

            $rootScope.$on('resetView', function (event, args) {
                pagerHelper.reset();
            });

            $rootScope.$on('executeFilter', function (event, args) {
                executeFilter(args.Filter);
            });

            vm.resources = $rootScope.resources;

            //vm.gridOptions = $scope.vm.options;
            vm.initialItemsCount = 1;
            vm.finalItemsCount = 1;
            vm.currentFilter = null;
            vm.view = $scope.vm.view;
            vm.filter = $scope.vm.filter;
            vm.showFilterButton = $scope.vm.showFilterButton;
            vm.copyShowFilterButton = angular.copy(vm.showFilterButton);
            vm.removeFilter = removeFilter;
            vm.deleteInboxRequest = deleteInboxRequest;
            vm.showInboxHistory = showInboxHistory;

            function deleteInboxRequest(event, row) {
                event.stopPropagation();
                if (vm.options.deleteInboxRequest) {
                    vm.options.deleteInboxRequest(row, function (response) {
                        var idx = vm.gridOptions.data.map(function (e) { return e.InstanceId; }).indexOf(row.entity.InstanceId);
                        if (idx) {
                            vm.gridOptions.data.splice(1, idx);
                        }
                    });
                }
            }

            function showInboxHistory(event, row) {
                event.stopPropagation();
                if (vm.options.showInboxHistory) {
                    vm.options.showInboxHistory(row);
                }
            }

            vm.configureGlobalMenu = function () {
                var menu = [];
                if (!$scope.vm.allowDbclick) {
                    menu.push({
                        title: 'Update Columns View', //$rootScope.resources.formeditor_tooltip_addcolumn,
                        icon: 'fa fa-columns color-blue',
                        leaveOpen: true,
                        order: 0,
                        action: function ($event) {
                            vm.updateSearchView();
                        }
                    });
                }

                return menu;
            }

            vm.gridOptions = {
                paginationPageSizes: [25],
                paginationPageSize: 25,
                useExternalPagination: true,
                minRowsToShow: 25,
                paginationCurrentPage: $stateParams.CurrentPage == null ? 1 : $stateParams.CurrentPage,
                enablePaginationControls: false,
                useExternalSorting: true,
                enableHorizontalScrollbar: uiGridConstants.scrollbars.NEVER,
                enableSorting: true,
                enableGridMenu: _.isUndefined(vm.options.controllerName) ? true : false,
                enableRowHashing: false,
                enableColumnMoving: !$scope.vm.allowDbclick,
                enableRowSelection: true,
                enableSelectAll: true,
                enableRowHeaderSelection: true,
                rowTemplate: 'rowtemplate.html',
                showGridFooter: false,
                //gridFooterTemplate: "<div class='pull-left thin-text-xs'>Total Items : {{grid.appScope.gridOptions.totalItems}}</div>",
                showColumnFooter: false,
                headerRowHeight: 60,
                appScopeProvider: this,
                exporterCsvFilename: 'myFile.csv',
                exporterPdfDefaultStyle: {
                    fontSize: 9
                },
                exporterSuppressColumns: ['HiddenInstance_Id', 'HiddenInstanceState', 'renvio', ' '],
                exporterPdfTableStyle: {
                    margin: [0, 5, 0, 15]
                },
                exporterPdfTableHeaderStyle: {
                    fontSize: 10,
                    bold: true,
                    fontFamily: "Segoe UI Light",
                    italics: true,
                    color: '#01579b'
                },
                exporterPdfHeader: {
                    text: "Appflow",
                    style: 'headerStyle'
                },
                exporterPdfFooter: function (currentPage, pageCount) {
                    return {
                        text: currentPage.toString() + ' of ' + pageCount.toString(),
                        style: 'footerStyle'
                    };
                },
                exporterPdfCustomFormatter: function (docDefinition) {
                    docDefinition.styles.headerStyle = {
                        fontSize: 10,
                        fontFamily: "Segoe UI Light",
                    };
                    docDefinition.styles.footerStyle = {
                        fontSize: 10,
                        bold: true
                    };
                    return docDefinition;
                },
                exporterPdfOrientation: 'landscape',
                exporterPdfPageSize: 'LETTER',
                exporterPdfMaxGridWidth: 500,
                onRegisterApi: onRegisterApi,
                gridMenuCustomItems: vm.configureGlobalMenu()
            };

            var calculatedHeight = angular.element('body').height() - 207;
            vm.gridheight = vm.options ? (vm.options.height || calculatedHeight) : calculatedHeight;
            // delegates
            vm.openFilter = openFilter;
            vm.clearFilter = clearFilter;
            vm.ShowDetails = ShowDetails;
            vm.updateSearchView = $scope.vm.updateFilter;
            vm.editColumn = editColumn;
            vm.refreshGrid = refreshGrid;
            vm.updateView = updateView;
            vm.evaluateOperator = evaluateOperator;
            vm.onColumnPositionChanged = onColumnPositionChanged;
            vm.onSelectionChanged = onSelectionChanged;
            vm.showHistoryDetails = showHistoryDetails;
            vm.resendMessageClick = resendMessageClick;
            vm.toggleChecker = toggleChecker;

            function refreshGrid() {
                _afBusyFactory.show('afuigrid');
                if (!_.isNull(vm.currentFilter)) {
                    executeFilter(vm.currentFilter);
                }
                else {
                    init();
                }
            }

            function updateGrid(responseData) {
                var result = _.isUndefined(responseData) ? vm.view.Data : responseData;
                $rootScope.load = false;

                var hasArrayData = getArray(result);
                if (vm.gridOptions.data) {
                    vm.gridOptions.data = []
                    {
                        $timeout(function () {
                            vm.gridOptions.columnDefs = getcolumns();
                            vm.gridOptions.data = angular.copy(result.splice(0, 26));
                        }, 100);
                    }
                }
                else {
                    vm.gridOptions.columnDefs = getcolumns();
                    vm.gridOptions.data = result.splice(0, 26);
                }

            }

            function updateDom() {
                $timeout(function () {
                    $(".ui-grid-pager-last").hide();
                    $(".ui-grid-pager-first").hide();
                    $(".ui-grid-pager-control-input").prop("disabled", true);
                    angular.element('.ui-grid-viewport').addClass('custom-scroll');
                    angular.element('.ui-grid-pager-panel').addClass('thin-text-xs');
                }, 1500);
            }

            function init() {
                if (vm.options.initialize) {
                    vm.options.initialize(uiGridControl);
                }

                pagerHelper.reset();
                var fn = $scope.vm.refresh;
                if (fn) {
                    fn(initialize);
                }

                if (vm.view) {
                    vm.gridOptions.view = {
                        id: vm.view.Id,
                        name: vm.view.Name,
                        modelTemplateUrl: vm.view.ModalFilterTemplatePath,
                        modelControllerUrl: vm.view.ModalFilterControllerPath
                    }

                    var pagerOptions = {
                        subscriptionId: $stateParams.subscriptionId,
                        applicationId: $stateParams.applicationId,
                        viewId: vm.view.Id,
                        fields: vm.view.Fields,
                        userFilterExpression: vm.options.userFilterExpression,
                        filterExpression: vm.options ? (vm.options.filterExpression || null) : null,
                        pageNumber: _.isNull($stateParams.CurrentPage) ? 1 : $stateParams.CurrentPage,
                        tokens: _.isNull($stateParams.Tokens) ? null : $stateParams.Tokens
                    };

                    pagerHelper.initialize(pagerOptions, function (response) {
                        vm.showTable = true;
                        updateGrid(response);
                        _afBusyFactory.hide('afuigrid');
                    });
                }

                updateDom();
            }

            function initialize(subscriptionId, applicationId, fields, callback) {
                vm.showFilterButton = !_.isUndefined(vm.view.Id);

                var pagerOptions = {
                    subscriptionId: subscriptionId,
                    applicationId: applicationId,
                    viewId: vm.view.Id,
                    fields: fields
                };

                pagerHelper.initialize(pagerOptions, function (responseData) {
                    //pagerHelper.reset();
                    $rootScope.load = false;
                    vm.showTable = true;
                    vm.gridOptions.columnDefs = getcolumns();
                    vm.gridOptions.data = responseData;
                    if (callback) {
                        callback();
                    }
                });
            }

            function updateView(instanceConfig) {
                instanceConfig.UpdatedDate = new Date();
                instancesViewFactory.updateInstancesViewConfiguration($stateParams.subscriptionId, $stateParams.applicationId, instanceConfig)
                     .success(function (response) {
                         vm.message = $rootScope.resources.inbox_edit_configuration_saved;
                         notify(vm.message);
                     })
            }

            function editColumn(columnName) {
                var modalInstance = $modal.open({
                    animation: false,
                    templateUrl: 'EditColumnNameTemplate.html',
                    controller: function ($scope, $uibModalInstance, columnName) {

                        $scope.columnName = columnName;

                        $scope.close = function () {
                            $uibModalInstance.dismiss('cancel');
                        }

                        $scope.ok = function () {
                            $uibModalInstance.close($scope.columnName);
                        };

                    },
                    size: 'sm',
                    resolve: {
                        columnName: function () {
                            return columnName;
                        }
                    }
                });

                modalInstance.result.then(function (result) {
                    if (result !== columnName && !_.isEmpty(result)) {
                        var column = _.findWhere(vm.gridOptions.columnDefs, {
                            displayName: columnName
                        });
                        column.displayName = result;
                        vm.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);

                        if (vm.view) {
                            var columndef = _.findWhere(vm.view.Fields, {
                                DisplayText: columnName
                            });
                            if (columndef) {
                                columndef.DisplayText = result;
                                if (vm.view.Id) {
                                    vm.updateView(vm.view);
                                }
                            }
                        }

                    }
                });
            }

            function move(array, fromIndex, toIndex) {
                fromIndex = array.length === fromIndex ? fromIndex - 1 : fromIndex;
                array.splice(toIndex, 0, array.splice(fromIndex, 1)[0]);
                return array;
            }

            function calculateItemsCountFooter() {
                var current = pagerHelper._getCurrentToken();
                var start = ((pagerHelper.pageNumber - 1) * pagerHelper.pageSize) % pagerHelper.maxItemCount;
                if (current) {
                    if (pagerHelper.direction == "next") {
                        if (_.isNull(vm.currentFilter)) {
                            vm.initialItemsCount = start == 0 ? current.Initial : start + current.Initial;
                            vm.finalItemsCount = (vm.initialItemsCount + vm.gridOptions.data.length) - 1;
                        }
                        else {
                            vm.initialItemsCount = start == 0 && vm.initialItemsCount == 1 ? vm.initialItemsCount : vm.finalItemsCount + 1;
                            vm.finalItemsCount = (vm.initialItemsCount + vm.gridOptions.data.length) - 1;
                        }

                    }
                    else {
                        if (_.isNull(vm.currentFilter)) {
                            vm.finalItemsCount = vm.initialItemsCount == 1 && start == 0 ? (current.Initial + vm.gridOptions.data.length) - 1 : vm.initialItemsCount == 1 && start > 0 ? (current.Initial + start + vm.gridOptions.data.length) - 1 : vm.initialItemsCount - 1;
                            vm.initialItemsCount = start == 0 ? current.Initial : pagerHelper.pageNumber == 1 ? 1 : (vm.finalItemsCount - vm.gridOptions.data.length) + 1;
                        }
                        else {
                            vm.finalItemsCount = start == 0 && vm.initialItemsCount == 1 ? vm.initialItemsCount : vm.initialItemsCount - 1;
                            vm.initialItemsCount = vm.finalItemsCount - vm.gridOptions.data.length + 1;

                        }

                    }
                }
                else if (pagerHelper.pageNumber <= pagerHelper.maxItemCount / pagerHelper.pageSize) {
                    vm.initialItemsCount = start == 0 ? 1 : start + 1;
                    vm.finalItemsCount = (vm.initialItemsCount + vm.gridOptions.data.length) - 1;
                }
                else {
                    vm.finalItemsCount = vm.gridOptions.data.length;
                }

            }

            function onPaginationChanged(newPage, pageSize) {
                if (!vm.paginationLoaded) {
                    pagerHelper.calculateDirection(newPage);
                    pagerHelper.loadPage(newPage, function (response) {
                        vm.gridOptions.data = response;
                        calculateItemsCountFooter();
                    });
                }
                else {
                    vm.paginationLoaded = false;
                    $stateParams.CurrentPage = null;
                    $stateParams.Tokens = null;
                }
            }

            function onColumnPositionChanged(colDef, originalPosition, newPosition) {
                var currentIdx = vm.gridOptions.columnDefs.map(function (e) {
                    return e.name;
                }).indexOf(colDef.name);
                vm.view.Fields = move(vm.view.Fields, currentIdx - 2, newPosition === 0 ? 0 : newPosition - 3);
                updateView(vm.view);
            }

            function notify(message) {
                Notification.success({
                    message: "<i class='fa fa-copy'></i> <i>1 seconds ago...</i>",
                    title: "<i class='fa fa-fa-copy bounce animated'></i> <span class='thin-text-md'>" + message + "</span>"
                });
            }

            function onSelectionChanged() {
                var rowsSelected = vm.gridApi.selection.getSelectedRows();
                var countRows = rowsSelected.length;
                if (countRows > 0) {
                    $scope.$emit('onChangeAcceptAll', {
                        enabled: true
                    });
                }
                else {
                    $scope.$emit('onChangeAcceptAll', { enabled: false });
                }
            }

            function onRegisterApi(gridApi) {
                vm.gridApi = gridApi;
                vm.gridApi.core.on.sortChanged($scope, onSortChange);
                vm.gridApi.pagination.on.paginationChanged($scope, onPaginationChanged);
                vm.gridApi.colMovable.on.columnPositionChanged($scope, vm.onColumnPositionChanged);
                vm.gridApi.selection.on.rowSelectionChanged($scope, vm.onSelectionChanged);
                vm.gridApi.selection.on.rowSelectionChangedBatch($scope, vm.onSelectionChanged);
                uiGridControl.gridApi = gridApi;
            }

            function getArray(entity) {
                var data = _.first(_.findAllDescendants(entity).filter(function (item) {
                    if (!_.isNull(item)) {
                        return _.isArray(item);
                    }
                }));
                return data;
            }

            function createUrlTemplate(field) {
                var openMode = field.TypeDef.OpenMode === 0 ? 'modal' : 'blank';
                var caption = field.TypeDef.Caption;
                return '<a class="btn btn-xs btn-primary" style="margin-top: 4px;" af-link ng-model="row.entity[col.field]" open-mode="' + openMode + '" ng-if="row.entity[col.field] != \'\'">' + caption + '</a>';
            }

            function toggleChecker(checked) {
                var rows = vm.gridOptions.$gridScope.renderedRows, allChecked = true;

                for (var r = 0; r < rows.length; r++) {
                    if (rows[r].entity.checker !== true) {
                        allChecked = false;
                        break;
                    }
                }
                if (!vm.gridOptions.$gridScope.checker)
                    $scope.gridOptions.$gridScope.checker = {};

                vm.gridOptions.$gridScope.checker.checked = allChecked;
            }

            function showHistoryDetails(event, row) {
                event.stopPropagation();
                _afBusyFactory.show('afuigrid');
                openModalInstanceHistory(row);
            };

            function openModalInstanceHistory(row) {
                var instanceId = row.entity.HiddenInstance_Id;
                var modalInstance = $modal.open({
                    templateUrl: 'templates/modalInstanceHistory.html',
                    controller: 'modalInstanceHistoryController',
                    controllerAs: 'vm',
                    bindToController: true,
                    size: 'xl',
                    backdropClass: 'af-backdrop',
                    windowClass: 'af-modal-window',
                    resolve: {
                        model: function () {
                            //return Loader.loadInstanceReqs($stateParams.subscriptionId, $stateParams.applicationId, $stateParams.instanceId);
                            return LoaderHistory.loadData($stateParams.subscriptionId, $stateParams.applicationId, instanceId, $stateParams.activityId);
                        }
                    }
                });

                modalInstance.result.then(function (result) { }, function () {
                    _afBusyFactory.hide('afuigrid');
                });
            }

            function openModalInstanceHistoryByRouting(row) {
                var instanceId = row.entity.HiddenInstance_Id;
                $state.go('inbox.instanceHistory', {
                    subscriptionId: $stateParams.subscriptionId,
                    applicationId: $stateParams.applicationId,
                    instanceId: instanceId
                });
            }

            vm.createCellFormatTemplate = function (field) {
                var ngclass = "ng-class=\"";
                _.each(field.ColumnFormattingRules, function (rule, idx) {
                    if (idx === field.ColumnFormattingRules.length - 1) {
                        ngclass += "row.entity." + field.Name + " == \'" + rule.Value + '\' ? \'btn-' + rule.BackgroundColor + '\':\'alert-default\'';
                    }
                    else {
                        ngclass += "row.entity." + field.Name + " == \'" + rule.Value + '\' ? \'btn-' + rule.BackgroundColor + '\' : ';
                    }
                });
                ngclass += "\"";
                var template = '<div class="btn btn-xs" ' + ngclass + ' style="width: 75px;margin-top: 4px;">{{ COL_FIELD }}</div>';
                return template;
            }

            function getcolumns() {
                var def = new Array();
                if (vm.options.columnsDefinition) {
                    def = vm.options.columnsDefinition;
                }
                else {
                    _.each(vm.view.Fields, function (field, idx) {
                        if (field) {
                            if (field.hasOwnProperty('DisplayAsLink')) {
                                if (field.DisplayAsLink) {
                                    def.push({
                                        field: field.Name,
                                        displayName: field.DisplayText,
                                        headerCellClass: 'thin-text-xs',
                                        cellClass: 'thin-text-xs text-center',
                                        cellTemplate: '<a href="{{COL_FIELD}}" target="_blank"><i class="fa fa-link"> <span class="thin-text-xs"> ' + $scope.$root.resources.common_open + ' </span>  </a>',
                                        headerTooltip: field.Path,
                                        menuItems: [
                                            {
                                                title: $rootScope.resources.inbox_edit_column,
                                                icon: 'fa fa-pencil',
                                                action: function ($event) {
                                                    vm.editColumn(this.context.col.displayName);
                                                },
                                                context: vm
                                            }
                                        ]
                                    });
                                }
                                else {
                                    def.push({
                                        field: field.Name,
                                        displayName: field.DisplayText,
                                        headerCellClass: 'thin-text-xs',
                                        cellClass: 'thin-text-xs',
                                        cellFilter: field.FormatType !== "none" ? field.FormatType : "",
                                        headerTooltip: field.Path,
                                        menuItems: [
                                    {
                                        title: $rootScope.resources.inbox_edit_column,
                                        icon: 'fa fa-pencil',
                                        action: function ($event) {
                                            vm.editColumn(this.context.col.displayName);
                                        },
                                        context: vm
                                    }
                                        ]
                                    });
                                }
                            }
                            else if (!_.isUndefined(field.TypeDef)) {
                                if (!_.isNull(field.TypeDef)) {
                                    if (field.TypeDef.$type === 'AppFlow.Authoring.UrlTypeDef, AppFlow.Application') {
                                        def.push({
                                            field: field.Name,
                                            displayName: field.DisplayText,
                                            headerCellClass: 'thin-text-xs',
                                            cellClass: 'thin-text-xs text-center',
                                            cellTemplate: createUrlTemplate(field),
                                            headerTooltip: field.Path,
                                            menuItems: [
                                {
                                    title: $rootScope.resources.inbox_edit_column,
                                    icon: 'fa fa-pencil',
                                    action: function ($event) {
                                        vm.editColumn(this.context.col.displayName);
                                    },
                                    context: vm
                                }
                                            ]
                                        });
                                    }
                                    else if (field.TypeDef.$type === 'AppFlow.Authoring.StringTypeDef, AppFlow.Application') {
                                        if (!_.isUndefined(field.ColumnFormattingRules) && !_.isNull(field.ColumnFormattingRules)) {
                                            if (field.ColumnFormattingRules.length > 0) {
                                                def.push({
                                                    field: field.Name,
                                                    displayName: field.DisplayText,
                                                    headerCellClass: 'thin-text-xs',
                                                    width: 90,
                                                    cellClass: 'thin-text-xs text-center',
                                                    cellTemplate: vm.createCellFormatTemplate(field),
                                                    headerTooltip: field.Path,
                                                    cellFilter: field.FormatType !== "none" ? field.FormatType : "",
                                                    menuItems: [
                                          {
                                              title: $rootScope.resources.inbox_edit_column,
                                              icon: 'fa fa-pencil',
                                              action: function ($event) {
                                                  vm.editColumn(this.context.col.displayName);
                                              },
                                              context: vm
                                          }
                                                    ]
                                                });
                                            }
                                            else {
                                                def.push({
                                                    field: field.Name,
                                                    displayName: field.DisplayText,
                                                    headerCellClass: 'thin-text-xs',
                                                    cellClass: 'thin-text-xs',
                                                    headerTooltip: field.Path,
                                                    cellFilter: field.FormatType !== "none" ? field.FormatType : "",
                                                    menuItems: [
                                                              {
                                                                  title: $rootScope.resources.inbox_edit_column,
                                                                  icon: 'fa fa-pencil',
                                                                  action: function ($event) {
                                                                      vm.editColumn(this.context.col.displayName);
                                                                  },
                                                                  context: vm
                                                              }
                                                    ]
                                                });
                                            }
                                        }
                                        else {
                                            def.push({
                                                field: field.Name,
                                                displayName: field.DisplayText,
                                                headerCellClass: 'thin-text-xs',
                                                cellClass: 'thin-text-xs',
                                                headerTooltip: field.Path,
                                                cellFilter: field.FormatType !== "none" ? field.FormatType : "",
                                                menuItems: [
                            {
                                title: $rootScope.resources.inbox_edit_column,
                                icon: 'fa fa-pencil',
                                action: function ($event) {
                                    vm.editColumn(this.context.col.displayName);
                                },
                                context: vm
                            }
                                                ]
                                            });
                                        }

                                    }
                                    else {
                                        def.push({
                                            field: field.Name,
                                            displayName: field.DisplayText,
                                            headerCellClass: 'thin-text-xs',
                                            cellClass: 'thin-text-xs',
                                            headerTooltip: field.Path,
                                            cellFilter: field.FormatType !== "none" ? field.FormatType : "",
                                            menuItems: [
                                        {
                                            title: $rootScope.resources.inbox_edit_column,
                                            icon: 'fa fa-pencil',
                                            action: function ($event) {
                                                vm.editColumn(this.context.col.displayName);
                                            },
                                            context: vm
                                        }
                                            ]
                                        });
                                    }
                                }
                            }
                        }
                    });

                    if (vm.view.AllowedHistory) {
                        def.push({
                            width: 70,
                            name: ' ',
                            field: 'history',
                            enableColumnMenu: false,
                            //headerTooltip: $scope.$root.resources,
                            headerCellTemplate: "<div class=\"text-center\" style=\"margin-top: 5px;\"><i class=\"fa fa-fw fa-clock-o\"></i></div>",
                            cellTemplate: '<div align="center"><button style="margin-top: 3px;" type="button" ng-click="grid.appScope.showHistoryDetails($event,row)" class="btn btn-primary btn-xs"><i class="fa fa-clock-o"></i></button></div>'
                        });
                    }
                }

                if ($scope.vm.allowDbclick && vm.options.controllerName != "viewFilterInboxController") {
                    var sendResendMessageCellTemplate = '<div align="center">' +
                                                    '<button style="margin-top: 3px;"' +
                                            'type="button"' +
                                                'ng-click="grid.appScope.resendMessageClick($event,row)"' +
                                                'class="btn btn-primary btn-xs">' +
                                                '<i class="fa fa-envelope-o"></i>' +
                                        '</button>' +
                                      '</div>';

                    def.push({
                        width: 50,
                        name: 'renvio',
                        field: 'resend',
                        headerCellTemplate: "<div class=\"text-center\" style=\"margin-top: 5px;\"><i class=\"fa fa-fw fa-envelope-o\"></i></div>",
                        enableColumnMenu: false,
                        //headerTooltip: $scope.$root.resources.,
                        cellTemplate: sendResendMessageCellTemplate
                    })
                }
                def.push({
                    field: "HiddenInstance_Id", visible: false, displayName: "HiddenInstance_Id"
                });
                def.push({
                    field: "HiddenInstanceState", visible: false, displayName: "HiddenInstanceState"
                });

                return def;
            }

            function ShowDetails(row) {
                if ($scope.vm.allowDbclick) {
                    _afBusyFactory.show('afuigrid');
                    var instanceId = row.entity.HiddenInstance_Id;

                    if (instanceId) {
                        if (row.entity.HiddenInstanceState !== "Closed") {
                            $state.go('instance',
                                              {
                                                  subscriptionId: $stateParams.subscriptionId,
                                                  applicationId: $stateParams.applicationId,
                                                  instanceId: instanceId,
                                                  Tokens: pagerHelper.tokens,
                                                  CurrentPage: pagerHelper.pageNumber
                                              }, {
                                                  reload: true
                                              });
                        }
                        else {
                            Notification.info({
                                message: "<i class='fa fa-info'></i> <i> Can not open request...</i>",
                                title: "<i class='fa fa-fa-info-circle bounce animated'></i> <span class='thin-text-md'> This Request was already closed </span>"
                            });
                            _afBusyFactory.hide('afuigrid');
                        }
                    }
                }
            }

            function resendInvoiceModelController($scope, $uibModalInstance) {
                $scope.entry = '';
                $scope.allowInvite = false;

                var senderModal = {
                    _emails: [],
                    _touched: false,
                    _isValid: true,
                    _setValidity: function () {
                        this._isValid = _.where(this._emails, {
                            valid: false
                        }).length == 0 && this._emails.length > 0;

                        $scope.allowInvite = this._isValid;
                        $scope.showErrorMessage = !this._isValid && this._emails.length > 0;
                    },
                    get: function () {
                        return this._emails;
                    },
                    getAsArray: function () {
                        return _.pluck(this._emails, 'email');
                    },
                    add: function (item) {
                        if (_.isUndefined(item) || _.isEmpty(item)) return;
                        this._touched = true;
                        if (_.validateEmail(item)) {
                            this._emails.push({
                                id: _.uniqueId('itm_'),
                                email: item,
                                valid: true,
                                tooltip: item
                            });
                        }
                        else {
                            this._emails.push({
                                id: _.uniqueId('itm_'),
                                email: item,
                                valid: false,
                                tooltip: item + ' is an invalid email.'
                            });
                        }

                        this._setValidity();
                    },
                    remove: function (item) {
                        var idx = this._emails.map(function (e) {
                            return e.id
                        }).indexOf(item.id);
                        this._emails.splice(idx, 1);

                        this._setValidity();
                    },
                    pop: function () {
                        this._emails.pop();
                    },
                    getIsValid: function () {
                        return this._isValid && !this._touched;
                    }
                }

                $scope.emails = senderModal.get();

                $scope.addEmail = function (e) {
                    senderModal.add($scope.entry);
                    $scope.entry = '';
                    angular.element('input[name=Email]').focus();
                }

                $scope.removeItem = function (item) {
                    senderModal.remove(item);
                }

                $scope.ok = function () {
                    $uibModalInstance.close(senderModal.getAsArray());
                };

                $scope.cancel = function () {
                    $uibModalInstance.dismiss('cancel');
                };
            }

            function resendMessageClick(event) {
                event.stopPropagation();
                var modalInstance = $modal.open({
                    templateUrl: 'resendInvoiceModal.html',
                    controller: resendInvoiceModelController,
                    size: 'sm',
                    backdrop: 'static',
                    windowClass: 'af-modal-window'
                });

                modalInstance.result.then(function (result) {
                    if (result != null) {
                        vm.sendInvitation(result);
                    }
                });
            }

            function onSortChange(grid, sortColumns) {
                if (sortColumns.length === 0) {
                    pagerHelper.sort = null;
                } else {
                    pagerHelper.sort = sortColumns[0].sort.direction;
                }
                //TODO función para Solicitar paginación con ordenamiento de datos
            }

            function clearFilter() {
                var fn = vm.filter;
                vm.showActiveFilters = vm.currentFilter = null;
                fn('', function (response, continuationToken) {
                    pagerHelper.updateData(response, continuationToken, function (response) {
                        vm.gridOptions.paginationCurrentPage = 1
                        vm.gridOptions.data = response;
                        vm.showClearButton = false;
                        vm.showFilterButton = vm.copyShowFilterButton;
                        $rootScope.$broadcast('clearFilter');
                    });
                });
            }

            function removeFilter(activeFilter) {
                var filtertoDelete = _.findWhere(vm.currentFilter, {
                    Path: activeFilter.Path
                });
                filtertoDelete.Value1 = "";
                var fn = vm.filter;
                var idx = vm.showActiveFilters.map(function (e) { return e.Path; }).indexOf(activeFilter.Path);
                vm.showActiveFilters.splice(idx, 1);
                fn(vm.currentFilter, function (response, continuationToken) {
                    pagerHelper.updateData(response, continuationToken, function (response) {
                        vm.gridOptions.data = response;
                        if (vm.showActiveFilters.length === 0) {
                            vm.showClearButton = false;
                            vm.showFilterButton = vm.copyShowFilterButton;
                            $rootScope.$broadcast('clearFilter');
                            vm.currentFilter = null;
                        }
                        else {
                            vm.showClearButton = true;
                            vm.showFilterButton = false;
                        }
                    });
                });
            }

            function evaluateOperator(activeFilter) {
                switch (activeFilter.Operator) {
                    case 'between':
                        return vm.resources.filters_between;
                        break;
                    case 'contains':
                        return vm.resources.filters_contains;
                        break;
                    case 'endswith':
                        return vm.resources.filters_endsby;
                        break;
                    case 'startswith':
                        return vm.resources.filters_startsby;
                        break;
                    case '>':
                        return activeFilter.ControlType == "IntegerTypeDef" ? vm.resources.filters_greaterthan : vm.resources.filters_after;
                        break;
                    case '<':
                        return activeFilter.ControlType == "IntegerTypeDef" ? vm.resources.filters_smallerthan : vm.resources.filters_before;
                        break;
                    case '>=':
                        return activeFilter.ControlType == "IntegerTypeDef" ? vm.resources.filters_greaterorequal : vm.resources.filters_afterorequal;
                        break;
                    case '=<':
                        return activeFilter.ControlType == "IntegerTypeDef" ? vm.resources.filters_smallerorequal : vm.resources.filters_beforeorequal;
                        break;
                    case '=':
                        return vm.resources.filters_equalto;
                        break;
                };
            }

            function executeFilter(resultFilter) {
                _afBusyFactory.show('afuigrid');
                var fn = vm.filter;
                vm.currentFilter = resultFilter;
                vm.showActiveFilters = _.filter(angular.copy(resultFilter), function (filter) {
                    if (_.isNumber(filter.Value1)) {
                        var field = _.findWhere(vm.view.Fields, {
                            'Path': filter.Path
                        });
                        if (!_.isEmpty(field.FormatType)) {
                            if (field.FormatType === 'currency' && !_.isNull(filter.Value1)) {
                                filter.Value1 = $filter('currency')(parseInt(filter.Value1));
                                if (filter.Value2) {
                                    filter.Value2 = $filter('currency')(parseInt(filter.Value2));
                                }
                                return filter.Value1;
                            }
                            return !_.isNull(filter.Value1);
                        }
                        return filter.Value1;
                    }
                    else if (_.isString(filter.Value1)) {
                        return !_.isEmpty(filter.Value1) && !_.isNull(filter.Value1);
                    }
                    else if (_.isBoolean(filter.Value1)) {
                        return !_.isNull(filter.Value1);
                    }
                    else if (_.isDate(filter.Value1)) {
                        var formatted = $filter('date')(filter.Value1, "yyyy-MM-dd", "");
                        filter.Value1 = formatted;
                        if (filter.Value2) {
                            formatted = $filter('date')(filter.Value2, "yyyy-MM-dd", "");
                            filter.Value2 = formatted;
                        }
                        return !_.isNull(filter.Value1);
                    }
                });
                fn(resultFilter, function (data, continuationToken) {
                    pagerHelper.updateData(data, continuationToken, function (response) {
                        vm.gridOptions.data = response;
                        vm.showClearButton = true;
                        vm.showFilterButton = false;
                        _afBusyFactory.hide('afuigrid');
                        vm.gridOptions.paginationCurrentPage = 1;
                        calculateItemsCountFooter();
                    });
                });
            }

            function openFilter() {
                var controllerName = vm.options.controllerName || 'viewFilterController_' + vm.gridOptions.view.id;
                var modalFilterTemplatePath = vm.options.modalFilterTemplatePath || vm.gridOptions.view.modelTemplateUrl;
                var modalInstance = $modal.open({
                    animation: false,
                    templateUrl: modalFilterTemplatePath,
                    controller: controllerName,
                    controllerAs: 'vm',
                    size: 'md',
                    resolve: {
                        options: function () {
                            return {
                                subscriptionId: $stateParams.subscriptionId,
                                applicationId: $stateParams.applicationId,
                                gridOptions: vm.gridOptions,
                                filter: vm.currentFilter === null ? undefined : vm.currentFilter
                            }
                        },
                        lookupService: function () {
                            return {
                                getLookup: function (subscriptionId, applicationId, lookupId, isGlobal) {
                                    if (isGlobal.toLowerCase() === 'true') {
                                        return $runtimeApi.getGlobalLookup(subscriptionId, lookupId);
                                    }
                                    else {
                                        return $runtimeApi.getLookup(subscriptionId, applicationId, lookupId);
                                    }
                                }
                            }
                        }
                    }
                });

                modalInstance.result.then(function (result) {
                    executeFilter(result);
                });
            }

            init();
        }

        return {
            controller: controller,
            templateUrl: 'templates/afUiGrid.html',
            controllerAs: 'vm',
            scope: {},
            bindToController: {
                options: '=',
                view: '=',
                filter: '=',
                updateFilter: '=',
                refresh: '=',
                showFilterButton: '=',
                allowDbclick: '='
            }
        };
    }
})();
