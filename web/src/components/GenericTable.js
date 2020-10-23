import React, { PureComponent } from 'react';
import { Table, Input, Button, Icon } from 'antd';
import { renameProp } from '../helpers';
import Highlighter from 'react-highlight-words';
import _ from 'lodash';

import './styles/GenericTable.css';
// const {Text} = Typography;
const searchStyle = (filtered) => {return { color: filtered ? '#1890ff' : undefined }}
const booleanStyle = {width:'100%', display:'inline-block', textAlign:'center'}
const booleanIconStyle = (text) => {
    return{color:'rgb(23, 144, 255)', fontSize:'1.45em', display:(text==='true'?'inline-block':'none')}
}

class GenericTable extends PureComponent {
    state = {
        searchText: '',
    };

    getColumnSearchProps = (dataIndex, inSearch) => (inSearch ? {
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
          <div style={{ padding: 8 }}>
            <Input
              ref={node => {
                this.searchInput = node;
              }}
              placeholder={`Search`} value={selectedKeys[0]}
              onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => this.handleSearch(selectedKeys, confirm)}
              style={{ width: 188, marginBottom: 8, display: 'block' }}
            />
            <Button
              type="primary"
              onClick={() => this.handleSearch(selectedKeys, confirm)}
              icon="search"size="small"
              style={{ width: 90, marginRight: 8 }}
            >
              Search
            </Button>
            <Button onClick={() => this.handleReset(clearFilters)} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </div>
        ),
        filterIcon: filtered => (
          <Icon type="search" style={searchStyle(filtered)} />
        ),
        onFilter: (value, record) =>
          record[dataIndex]
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase()),
        onFilterDropdownVisibleChange: visible => {
          if (visible) {
            setTimeout(() => this.searchInput.select());
          }
        },
      }: {});
    
    handleSearch = (selectedKeys, confirm) => {
    confirm();
    this.setState({ searchText: selectedKeys[0] });
    };

    handleReset = clearFilters => {
    clearFilters();
    this.setState({ searchText: '' });
    };

    render() {

        // remap some titles for aestietic purposes
        const {titleMap, sortMap, searchMap, expansion} = this.props

        // convert all types,.. to string (display purposes)
        const data = this.props.data ? this.props.data.map((d, i)=>{

            // id ~ key (depending on the view, React requires a key attribute)
            if ('id' in d) {d = renameProp('id', 'key', d);}

            if (!('key' in d)) {d['key'] = i;}

            return _.transform(d, (r, v, k)=>r[k]=v.toString(), {})
        }) : [];
        
        // TOOO: enable searchable columns : https://ant.design/components/table/
        // construct readable columns from data (assuming data all share same keys)
        // - key/id are not in columns (displayable)
        
        const formatted_title = (k) => {
            const title = titleMap[k] ? titleMap[k] : k;
            return (title.charAt(0).toUpperCase() + title.slice(1))
                .replace(/_/g,' ')
        }
        
        // dumb question, why would text ever be undefined
        const columns = data ? _.keys(data[0])
            .filter(k=>k!=="key")
            .map(k=>{return{
            title: k === 'key' ? 'ID' : formatted_title(k),
            dataIndex: k,
            colSpan: 1,
            sorter: sortMap ? sortMap[k] : null,
            ...this.getColumnSearchProps(k, searchMap.indexOf(k) !== -1),
            render: text => (<span 
                style={
                 ['true','false'].indexOf(text) !== -1 ? booleanStyle : {}
                }>
                {['true','false'].indexOf(text) !== -1 
                  ? <Icon 
                      type='thunderbolt'
                      theme='filled'
                      style={booleanIconStyle(text)}/>
                  : <Highlighter
                      highlightStyle={{ backgroundColor: '#ffc069', padding: 0 }}
                      searchWords={[this.state.searchText]}
                      autoEscape
                      textToHighlight={text ? text.toString() : ""}
                  />}
                </span>
              )
            }})
            .sort((_a, _b) => {
                const a = this.props.sortOrder.indexOf(_a.dataIndex);
                const b = this.props.sortOrder.indexOf(_b.dataIndex);
                return a - b;
            }) : [];

        return (<Table
            pagination={{
                defaultPageSize:30
            }}
            columns={columns}
            dataSource={data}
            onExpand={this.props.onExpand}
            expandRowByClick={expansion ? true : false}
            expandedRowRender={expansion ? (record, index, indent, expanded) => {

                // evaluate if there is a pre-rendering action 
                // if so *do not render* 
                const expansionRenderAction = expanded && this.props.onExpansionRender && this.props.onExpansionRender(record);

                // event hook for expansion rendering 
                const dom = !expansionRenderAction ? 
                (<div className='expansion-controls' style={this.props.expansionControlStyle}>
                    <Button.Group>
                    {_.filter(expansion, 
                        {id:Number.parseInt(record.key)}).map(e => 
                        e.format.map(f =>
                            <Button 
                                disabled={e[`${f.key}_count`] === 0}
                                type="link" 
                                onClick={(event) => this.props.onExpansionClick(record, f.key)} 
                                key={f.key}>
                                {e[`${f.key}_count`] !== undefined && e[`${f.key}_count`] > 1 ? 
                                "(" + e[`${f.key}_count`] + ")": ''} {f.text}
                                <Icon type="right"/>
                            </Button>
                        )
                    )}
                    </Button.Group>
                    </div>): null 

                return dom;
            } : null}
            size="middle"
            title={() => this.props.title ? this.props.title: null}
            onRow={expansion ? null : (record, rowIndex) => {
                return {
                  onClick:(event) => {this.props.onRowClick(record, rowIndex)}
                }
            }}
        />)
    }
}
// {expansion.map(op => (<Button key={op.key} type="default">{op.text}</Button>))}
GenericTable.defaultProps = {
    onRowClick:() => {},    // empty function
    sortOrder:[],           // ordering of the columns
    searchMap:[],
    titleMap: {},           // mapping of the keys to title, defaults to title case of key
    expansionControlStyle:{},
    onExpand:() => {}
}

export default GenericTable;