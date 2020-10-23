import React, { PureComponent } from 'react';
import { Table, Typography, Tooltip, Icon } from 'antd';
import { CSVLink } from "react-csv";
import DiseaseLink from '../shared/DiseaseLink';
import _ from 'lodash';
import {inputStyleRemoval} from '../../../helpers';

const { Column }              = Table;
const { Text }                = Typography;

//const GNOMAD_REGION          = 'https://gnomad.broadinstitute.org/region/'
const GNOMAD_VARIANT           = 'https://gnomad.broadinstitute.org/variant/'
const SEQUENCE_ONTOLOGY_URL    = 'http://www.sequenceontology.org/browser/obob.cgi';
const GENE_CARDS_URL           = 'https://www.genecards.org/cgi-bin/carddisp.pl?gene=';

// Assembly to GNOMAD dataset version 
const REF_GNOMAD = {
    'GRCH37':'gnomad_r2_1', 
    'GRCH38':'gnomad_r3'
}

class VariantTable extends PureComponent {
    
    /* Map HTSLib GenotypeType to Zygosity */
    static HTSZygosity(genotype) {
        switch(genotype) {
            case 'HET':
                return 'Het';

            case 'HOM_REF':
            case 'HOM_VAR':
                return 'Hom';

            case 'MIXED':
                return 'Mixed';

            case 'NO_CALL':
                return 'No call';

            case 'UNAVAILABLE':
                return 'Unavailable';

            default:
                return 'NA';
        }
    }

    static hgvs_gnomad(hgvs_variant, ref = 'GRCH37') {
        const dataset = REF_GNOMAD[ref];
        const match = hgvs_variant.match(/(?<CHROM>\d+):g\.(?<POS>\d+)(?<REF>[GCTAgcta.*]+)>(?<ALT>[GCTAgcta.*]+)/)

        if (match && match.groups) {
            
            // can't match HGVS to Gnomad
            if (match.groups.ALT === "*") {
                const alt_gnomad = match.groups.REF.substring(0,1);
                return `${GNOMAD_VARIANT}${match.groups.CHROM}-${match.groups.POS}-${match.groups.REF}-${alt_gnomad}?dataset=${dataset}`;
                // return `${GNOMAD_REGION}${match.groups.CHROM}-${match.groups.POS}-${match.groups.POS}?dataset=${dataset}`;
            } else {
                return `${GNOMAD_VARIANT}${match.groups.CHROM}-${match.groups.POS}-${match.groups.REF}-${match.groups.ALT}?dataset=${dataset}`;
            }
        }

        return "#";
    }

    render() {
    return (
        <div>
            <Table 
                tableLayout='fixed'
                title={() => <h3>{'Variants (outputs)'}</h3>} 
                dataSource={this.props.display_variants}
                className='diver-table'
                pagination={false}
                rowClassName={(record, index) => index%2 === 1 ? 'row-stripe' : '' }
                expandedRowRender={record => (
                    <p style={{ margin: '10px 0px 20px 0px'}}>
                        <Text mark style={{lineHeight:'30px'}}>{record.hgvs_variant}</Text>
                    </p>
                )}>

                <Column 
                    title={<Tooltip title="Variant (HGVS)">Variant (HGVS)</Tooltip>} 
                    dataIndex='hgvs_variant' 
                    key='hgvs_variant' 
                    ellipsis={true}
                    width={160}
                    render={text => 
                        <a rel="noopener noreferrer" 
                            target='_blank' 
                            href={VariantTable.hgvs_gnomad(text, this.props.reference)}>
                            {text}
                        </a>}/>

                <Column 
                    title='Zyg' 
                    width={70}
                    dataIndex='zygosity' 
                    key='zygosity'
                    render={text=>VariantTable.HTSZygosity(text).toLowerCase()}
                    />
            
                <Column 
                    title='Variant Effect' 
                    dataIndex='variant_effect' 
                    width={130}
                    key='variant_effect'
                    render={text=>(
                        <form target="_blank" action={SEQUENCE_ONTOLOGY_URL} method='POST'> 
                            <input type="hidden" name="rm" value="term_list"/>
                            <input type="hidden" name="obo_query" value={text}/>
                            <input type="hidden" name="release" value="current_release"/>
                            <input style={inputStyleRemoval}
                                type="submit" value={text
                                    .replace(/_/g, ' ')
                                    .replace('variant', '')
                            }/>
                        </form>)
                    }/>
                
                <Column 
                    title='Gene' 
                    dataIndex='gene'
                    width={100} 
                    key='gene'
                    sorter={(a, b) => a.gene.localeCompare(b.gene)}
                    sortDirections={['descend', 'ascend']}
                    render={text=>(
                        <a 
                            href={`${GENE_CARDS_URL}${text}`}
                            rel="noopener noreferrer"
                            target='_blank'>
                            <span style={{fontStyle:'italic'}}>{text}</span>
                        </a>
                    )}/>
            
                <Column 
                    title='Disease(s)' 
                    dataIndex='diseases' 
                    key='diseases'
                    width={120} 
                    render={(text, record) => 
                        <span>
                            {_.uniq(text.split(", ")).map((t,i)=>
                                <Text className='no-wrap' code key={i}>
                                {record['assoc'].has(t) ? 
                                    <span><DiseaseLink disease={t}/> <Icon type="flag" theme="filled"/></span> : 
                                    <span><DiseaseLink disease={t}/> </span> }
                                </Text>)}
                        </span>
                    }/>
        
            </Table>
            <div style={{textAlign:'right'}}>
                <CSVLink 
                filename={`genomediver-output-variants.csv`} 
                data={_.cloneDeep(this.props.display_variants).map(row=>{
                    delete row['key'];
                    delete row['assoc'];
                    row['zygosity'] = VariantTable.HTSZygosity(row['zygosity']);
                    return row;
                })}><Icon type="download" /> Download CSV</CSVLink>
            </div>
        </div>
    )}
}

export default VariantTable;