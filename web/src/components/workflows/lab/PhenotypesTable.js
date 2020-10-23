import React, { PureComponent } from 'react';
import { Table, Rate, Icon} from 'antd';
import { CSVLink } from "react-csv";
import _ from 'lodash'; 

const { Column }    = Table;
const HPO_URL       = "https://hpo.jax.org/app/browse/term/"

class PhenotypesTable extends PureComponent {
    
    render() {
        const {phenotypes, analysis_ids} = this.props; 
        const pdata = phenotypes ? _.cloneDeep(phenotypes)
            .filter((p, i) => {
                // - Only consider phenotypes that are part of the dive 
                // - filter out free phenotypes (not associated with any analysis)
                const of_analysis = p['of_analysis'].map(p => {return p.id});
                return _.intersection(of_analysis, analysis_ids).length > 0;
            })
            .map((p,i) => {
                // flatten of analysis into a string 
                p['of_analysis'] = p['of_analysis'].map(a => {
                    return a['pipeline'];
                }).join(', ');
                
                // map a key for react 
                p['important'] = +p['important']
                p['key'] = p.id;
                return p
            }) : undefined;

        return (
            <div>
            { pdata ? (
                <div>
                <Table
                    title={() => <h3>{'Classified phenotypes:'}</h3>} 
                    dataSource={pdata}
                    className='diver-table'
                    pagination={false}>

                    <Column
                        title='HPO Term'
                        dataIndex='hpo_term'
                        key='hpo_term'
                        sorter={(a, b) => a.hpo_term.localeCompare(b.hpo_term) }
                        //sortDirections={['descend', 'ascend']}
                        />

                    <Column
                        title='HPO ID'
                        dataIndex='hpo_id'
                        key='hpo_id'
                        sorter={(a, b) => a.hpo_id.localeCompare(b.hpo_id)}
                        //sortDirections={['descend', 'ascend']}
                        render={text=>
                            <a href={`${HPO_URL}${text}`} 
                               rel="noopener noreferrer"
                               target='_blank'>
                                {text}
                            </a>
                        }/>
                    
                    {/* TODO: YES => Yes, titleCase */}
                    <Column 
                        title='Class'
                        dataIndex='category'
                        sorter={(a, b) => a.category.localeCompare(b.category)}
                        //sortDirections={['descend', 'ascend']}
                        key='category'
                        render={(text,record) => 
                            <span>
                            {text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()}
                            </span>
                        }/>

                    <Column 
                        title='Star'
                        dataIndex='important'
                        sorter={(a, b) => a.important - b.important}
                        //sortDirections={['descend', 'ascend']}
                        key='important'
                        render={(text,record) => 
                            <span>
                                {record['important'] ? 
                                <Rate defaultValue={+record.important} disabled count={1}/> 
                                : ""}
                            </span>
                        }/>

                    {/* <Column 
                        title='Pipeline'
                        dataIndex='of_analysis'
                        key='of_analysis'
                        render={text => 
                            <span>
                                {text.split(", ").map((t,i)=>
                                    <Text className='no-wrap' code key={i}> 
                                        <span>{t}</span>
                                    </Text>)}
                            </span>
                        }/> */}

                </Table>
                <div style={{textAlign:'right'}}>
                    <CSVLink
                        filename={`genomediver-input-phenotypes.csv`}  
                        data={_.cloneDeep(pdata).map(p=> {
                        delete p['key'];
                        delete p['id'];
                        p['important'] = p['important'] ? 'YES' : 'NO';
                        return p;
                    })}><Icon type="download" /> Download CSV</CSVLink>
                </div>
                </div>
                )
            : <p></p>
            }
            </div>
        )
    }
}

export default PhenotypesTable;