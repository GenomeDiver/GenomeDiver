import React, { PureComponent } from 'react';
import {Rate, Affix, Icon, Tooltip} from 'antd';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import "./styles/RefinePhenotype.css"

const DISPLAY_CATEGORIES    = {"UNASSIGNED": "Classify all phenotype features:"};
const HPO_URL               = "https://hpo.jax.org/app/browse/term/";

const iconStyle = {
    width: 22,
    height: 22
}

/* Phenotype Item (draggable) used in our refinement component */ 
export class PhenotypeItem extends PureComponent {
    render() {
        const {phenotype_data, phenotype_id, index} = this.props;
        const p = phenotype_data[phenotype_id];
        
        return (
            <Draggable draggableId={phenotype_id} index={index}>
                {(provided, snapshot) => (
                     <div 
                        className={snapshot.isDragging ? 
                            'refine-draggable ant-alert-info is-dragging' : 
                            'refine-draggable ant-alert-info'}
                        ref={provided.innerRef}
                        {...provided.draggableProps} 
                        {...provided.dragHandleProps}>
                        
                        {/* !snapshot.isDragging && <Icon type="pushpin" theme="filled"/> */}
                        <div style={{marginTop:'5px'}}> 
                            {p.created_by.toUpperCase().endsWith('DIVER') && <Tooltip title="GenomeDiver generated"><Icon component={() => (<img alt="GenomeDiver generated" style={iconStyle} src="/images/helix.svg"/>)}/></Tooltip>}                    
                            {p.created_by.toUpperCase().endsWith('CAREGIVER') && <Tooltip title="Clinically generated"><Icon type="eye" theme="filled"/></Tooltip>}
                            {p.created_by.toUpperCase().endsWith('LAB') && <Tooltip title="Phenotype from test order"><Icon type="paper-clip"/></Tooltip>}
                            &nbsp;<strong>{p.hpo_term}</strong>
                        </div> 
                        
                        <div>
                            <Rate defaultValue={p.important | 0} value={p.important | 0} count={1} 
                            onChange={(v) => this.props.onStar(phenotype_id, p.id, v)}/>
                            &nbsp;<a href={`${HPO_URL}${p.hpo_id}`} target='_blank' rel="noopener noreferrer">{p.hpo_id} </a>
                        </div>
                        
                        {provided.placeholder}
                    </div>
                )}
            </Draggable>    
        )
    }
}

/* Category (droppable) context grouping Phenotype */ 
export class PhenotypeCategory extends PureComponent {
    render() {
        const {category, category_id, phenotype_data, onStar} = this.props;

        const category_count = Object.values(phenotype_data)
            .filter(p => {return p.category === category_id})
            .length 

        return (
            <div className={`refine-droppable category-${category_id}`}>
                
                {category_id === 'UNASSIGNED' && <div style={{position:'absolute', zIndex:100}}>
                    <span className='category-title'><b>{DISPLAY_CATEGORIES[category_id] ? 
                        DISPLAY_CATEGORIES[category_id] : category_id} ({category_count})</b></span>
                </div>}
                
                {category_id !== 'UNASSIGNED' && 
                    <Affix offsetTop={10}><span className='category-title'><b>{DISPLAY_CATEGORIES[category_id] ? 
                        DISPLAY_CATEGORIES[category_id] : category_id} ({category_count})</b></span>
                    </Affix>}
                
                <div className="refine-scroller">
                    <Droppable 
                        droppableId={category_id} 
                        direction={category_id === 'UNASSIGNED' ? 'horizontal' : 'vertical'}>
                        {(provided) => (
                            <div
                                className='refine-droppable-context'
                                ref={provided.innerRef}
                                {...provided.droppableProps}>
                                
                                {category && category.ids.map((phenotype_id, i) => {
                                    return (<PhenotypeItem 
                                        onStar={onStar}
                                        key={phenotype_id} 
                                        index={i}
                                        phenotype_id={phenotype_id} 
                                        phenotype_data={phenotype_data}
                                        />)
                                })}

                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </div>
            </div>
        )
    }
}