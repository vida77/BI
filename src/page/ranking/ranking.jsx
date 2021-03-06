import React, {Component} from 'react';
import {Select, Card, Button, Icon, Table, Spin} from 'antd';
import moment from 'moment';

import * as carType from '../../components/ranking/car_types';
import * as navMenu from '../../components/ranking/navs';
import * as dateUtil from '../../components/ranking/DateFormat';
import * as api from '../../utils/api';
import * as city from '../../components/ranking/city';
import * as hash from '../../components/ranking/hashes';
import deepMerge from 'deepmerge';

import './ranking.less';

const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';;
const HEADER_DATE_FORMAT = 'MM/DD';
const ROW_KEY_DATE_FORMAT = 'YYYYMMDD';
const YESTERDAY = moment().subtract('1', 'days').format(DEFAULT_DATE_FORMAT);

export default class Ranking extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedCarType: 'all',
      selectedDateType: 'days',
      selectedBaseDay: YESTERDAY,

      pageLoading: false,
      pageName: '',
      pageUrl: '',
      carTypes: {},
      dateTypes: {
        days: '日',
        weeks: '周',
        months: '月',
      },

      allCities: {},
      tableData: [],
      tableHeader: [],
      rangeDays: [],
      numberDigit: 0,
      showCarTypeSelection: true,
    }
  }

  //车型改变的处理方法
  handleCarTypeChange(carType) {
    this.setState({
      selectedCarType: carType
    }, () => {
      this.getAllData();
    })
  }

  //时间类型改变的处理方法
  handleDateTypeChange(dateType) {
    this.setState({
      selectedDateType: dateType
    }, () => {
      this.getAllData();
    })
  }

  //上一页、下一页改变的处理方法
  handlePageChange(num) {
    const baseDay = moment(this.state.selectedBaseDay);
    let newBaseDay = '';
    if (num > 0) {
      newBaseDay = baseDay.add(num, this.state.selectedDateType);
    } else {
      newBaseDay = baseDay.subtract(-num, this.state.selectedDateType);
    }
    newBaseDay = newBaseDay.format(DEFAULT_DATE_FORMAT);
    this.setState({
      selectedBaseDay: newBaseDay,
    }, () => {
      this.getAllData();
    });
  }

  //获取时间数组，用于请求api的时候的timeAt参数
  getRangeDays() {
    let rangeDays = dateUtil.getDateRange(this.state.selectedBaseDay, this.state.selectedDateType);
    this.setState({
      rangeDays: rangeDays,
    });
    return rangeDays;
  }

  //生成接口请求数据参数
  getApiParams(groupBy = '') {
    const pageUrl = this.state.pageUrl;
    let apiParams = {
      jobList: navMenu.getPageHashString(pageUrl),
      timeAt: this.getRangeDays().join(),
      groupBy: groupBy,
      CycleType: this.state.selectedDateType,
    };
    const carTypeIds = carType.getCarTypeIds(this.state.selectedCarType);
    if (this.state.selectedCarType === 'other') {
      apiParams['car_type_id!'] = carTypeIds;
    } else {
      apiParams['car_type_id'] = carTypeIds;
    }
    return apiParams;
  }

  //获取分城市数据
  getCityData() {
    return api.getDatamartData(this.getApiParams('city'));
    // return getFun.getDatamartData(this.getApiParams('city'));
  }

  //获取全国数据
  getNationData() {
    //return api.getDatamartData(this.getApiParams());
    // return getFun.getDatamartData(this.getApiParams());
  }

  //获取数据，包含分城市数据和全国数据
  getAllData() {
    this.setState({
      pageLoading: true,
    });

    Promise.all([this.getCityData(), this.getNationData()]).then(allData => {
      allData = deepMerge(allData[0], allData[1]);
      this.setState({
        tableData: this.formatTableData(allData),
        tableHeader: this.formatTableHeader(),
        pageLoading: false
      });
    }).catch(errCode => {
      this.setState({
        pageLoading: false,
        tableData: [],
        tableHeader: [],
      })
    });
  }

  //格式化表数据，以用于Table组件
  formatTableData(originData) {
    let flipData = {};
    for (let day in originData) {
      let dayKey = moment(day).format(ROW_KEY_DATE_FORMAT);
      let cityDataArray = originData[day];

      for (let cityHash in cityDataArray) {
        let hashArray = cityHash.split('_');
        let cityKey = hashArray.length === 2 ? hashArray[1] : 'allcity';
        if (!flipData.hasOwnProperty(cityKey)) {
          flipData[cityKey] = {};
        }
        flipData[cityKey][dayKey] = cityDataArray[cityHash];
      }
    }

    let data = [];
    for (let city in flipData) {
      let item = flipData[city];
      item['city'] = this.state.allCities[city];
      data.push(item);
    }

    let sortDay = this.getRangeDays()[0];
    let sortKey = moment(sortDay).format(ROW_KEY_DATE_FORMAT);
    const result = data.sort(this.compareLastItem(sortKey));

    let finalResult = [];
    for (let idx in result) {
      let item = result[idx];
      item['rank'] = parseInt(idx) + 1;
      item['key'] = parseInt(idx) + 1;
      finalResult.push(item);
    }
    return finalResult;
  }

  //格式化表头内容，以用于Table组件
  formatTableHeader() {
    let headers = [{
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: '8%',
    }, {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: '12%',
    }];

    const days = dateUtil.getDateRange(this.state.selectedBaseDay, this.state.selectedDateType);
    days.reverse();
    for (let day of days) {
      let dayTitle = this.state.dateTypes[this.state.selectedDateType] + ' ' + moment(day).format(HEADER_DATE_FORMAT);
      if (day === YESTERDAY) {
        const dateType = this.state.selectedDateType;
        if (dateType === 'days') {
          dayTitle = '昨天';
        }
        if (dateType === 'weeks') {
          dayTitle = '最近7天';
        }
        if (dateType === 'months') {
          dayTitle = '最近30天';
        }
      }
      let dayKey = moment(day).format(ROW_KEY_DATE_FORMAT);
      headers.push({
        title: dayTitle,
        dataIndex: dayKey,
        key: dayKey,
        sorter: (a, b) => a[dayKey] - b[dayKey],
        width: '10%',
        render: (text, record, index) => this.renderTableCellValue(text, record, index),
      });
    }
    return headers;
  }

  //自定义表格单元格内容显示方式
  renderTableCellValue(text, record, index) {
    const digit = this.state.numberDigit;
    return (
      <div className="cellValue">{this.formatNumber(text, digit)}</div>
    );
  }

  //数字格式化
  formatNumber(number, digit) {
    return this.milliFormat(parseFloat(number).toFixed(digit));
  }

  //数字添加千分符
  milliFormat(num) {
    return num && num.toString()
      .replace(/^\d+/g, (m) => m.replace(/(?=(?!^)(\d{3})+$)/g, ','))
  }

  //计算变化率
  calRate(a, b) {
    a = parseFloat(a);
    b = parseFloat(b);
    if (b === 0) {
      return 'NaN';
    }
    let result = (a / b).toFixed(2).toString();
    if (result === 'NaN') {
      return 'NaN';
    }
    return result + '%';
  }

  //排序用的比较方法
  compareLastItem(sortKey) {
    return function (a, b) {
      return b[sortKey] - a[sortKey];
    }
  }

  loadPageData(pageUrl) {
    const pageName = navMenu.getPageName(pageUrl);
    const numberDigit = hash.getHashDigit(navMenu.getPageHashKey(pageUrl));
    const showCarTypeSelection = navMenu.checkPageShowCarTypeSelection(pageUrl);

    this.setState({pageUrl, pageName, numberDigit, showCarTypeSelection}, () => {
      this.getAllData();
    });
  }

  componentWillMount() {
    this.setState({
      carTypes: carType.getCarTypes(),
    });
    city.getAllCities().then(cities => {
      this.setState({
        allCities: cities,
      });
    });
  }

  componentDidMount() {
    this.loadPageData(this.props.location.pathname);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.location.pathname !== nextProps.location.pathname) {
      this.loadPageData(nextProps.location.pathname);
    }
  }

  render() {
    const {selectedCarType, selectedDateType, pageName, carTypes, dateTypes, tableData, tableHeader, pageLoading, selectedBaseDay, showCarTypeSelection} = this.state;

    return (
      <div className="rank">
        <Card bordered={false} className="card-wrap" title={pageName} extra={
          <div>
            {showCarTypeSelection ?
              <Select className="search" value={selectedCarType} onChange={(val) => this.handleCarTypeChange(val)}>
                {
                  Object.keys(carTypes).map((carKey) => {
                    return <Select.Option key={carKey} value={carKey}>{carTypes[carKey]}</Select.Option>
                  })
                }
              </Select>
              : null}

            <Select className="search" value={selectedDateType} onChange={(val) => this.handleDateTypeChange(val)}>
              {
                Object.keys(dateTypes).map((dateKey) => {
                  return <Select.Option key={dateKey} value={dateKey}>{dateTypes[dateKey]}</Select.Option>
                })
              }
            </Select>

            <Button.Group>
              <Button onClick={() => this.handlePageChange(-1)}>
                <Icon type="left"/>前一页
              </Button>
              <Button onClick={() => this.handlePageChange(1)} disabled={selectedBaseDay >= YESTERDAY}>
                后一页<Icon type="right"/>
              </Button>
            </Button.Group>
          </div>
        }>

          <Table dataSource={tableData} columns={tableHeader}
                 pagination={false} loading={pageLoading} bordered
                 size="small" scroll={{x: true}}/>
        </Card>
      </div>
    )
  }
}