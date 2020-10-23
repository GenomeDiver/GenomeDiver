import React, { PureComponent } from 'react';
import { Table, Typography, Icon, Card} from 'antd';
import { CSVLink } from "react-csv";
import DiseaseLink from '../shared/DiseaseLink';
import _ from 'lodash'; 

const { Column }    = Table;
const { Text }      = Typography;

class DiseaseTable extends PureComponent {
    render() {
        const {flagged_only} = this.props; 
        const data = _.cloneDeep(this.props.display_disease).filter(d => {
            if (flagged_only) {
                // caregiver flag condition 
                return d['disease'] === d['selected'] 
            }
            return true;
        })
        
        // .map(d => {
        //     d['delta_combined_score'] = Math.random() - Math.random()
        //     return d 
        // })

    return (
        <div>
        {data && data.length > 0 ? <div>
        <Table 
            pagination={false}
            className='diver-table'
            dataSource={data} 
            rowClassName={(record, index) => index%2 === 1 ? 'row-stripe' : '' }>

        <Column 
            title='Gene'   
            dataIndex='gene'
            key='gene'
            render={text => 
                <span style={{fontStyle:'italic'}}>
                    {_.uniq(text.split(", ")).map((t,i)=>
                        <Text className='no-wrap' code key={i}>{t}</Text>
                    )}
                </span>}/>
        
        <Column
            title='Score (Change)'
            dataIndex='delta_combined_score'
            key='score'
            render={(score, record) =>
                <span>
                    <span style={{fontWeight:'bold'}}>{record.combined_score.toPrecision(4)}&nbsp;</span>
                    (<span style={{color:  score > 0 ? 'green' : 'red'}}>
                        {score > 0 ? '+' : ''}
                        {score.toFixed(4)}
                    </span>)
                </span>
            }/>

        <Column 
            title='Flag?' 
            dataIndex='selected' 
            key='selected' 
            // sorter={(a, b) => {
            //     const v1 = +(a.disease.trim() === a.selected.trim())
            //     const v2 = +(b.disease.trim() === b.selected.trim())
            //     return v1 - v2;
            // }}
            render={(text, record) => (
                <div>
                    <Icon type="flag" 
                    theme={text.length > 0 ? 'filled' : 'outlined'}
                    style={{ fontSize: '18px', color: 'gray' }}
                    onClick={() =>
                        !flagged_only && 
                        this.props.onDiseaseFlag(text.length === 0, record.disease)
                    }
                    />    
                </div>    
            )}/>

        <Column 
            title='Disease' 
            dataIndex='disease_name'   
            key='disease_name'
            // sorter={(a, b) => a.disease_name.localeCompare(b.disease_name)}
            sortDirections={['descend', 'ascend']}
            render={text => <Text>{text}</Text>}/>

        <Column 
            title='Explore Disease'   
            dataIndex='disease' 
            render={text => <DiseaseLink disease={text}/>}/>
        </Table>

        <div style={{textAlign:'right'}}>
            <CSVLink 
                filename={`genomediver-disease.csv`} 
                data={_.cloneDeep(data).map(d=>{
                delete d['key'];
                return d; 
            })}><Icon type="download"/> Download CSV</CSVLink>
        </div>
    </div> :
    <Card>
        <p>No flagged diseases</p>
    </Card>}
    </div>
    )}
}

export default DiseaseTable;

/* 
<div style={{display: 'inline-flex', 
    width:50, height:20, background:'#f5f5f5',
    verticalAlign:'bottom', marginLeft:5
    }}>
    <div style={{
        background: score > 0 ? 'orange' : 'lightblue',
        width: `calc(50%*${Math.abs(score)}`,
        marginLeft: score > 0 ? '50%' : `calc(${50 + 50*score}%)`
    }}>
    </div>
</div>  */