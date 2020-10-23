import React, { PureComponent } from 'react';
import {inputStyleRemoval} from '../../../helpers';

class DiseaseLink extends PureComponent {
    
    render() {
        const ORPHA_FORM_URL = 'https://www.orpha.net/consor/cgi-bin/Disease_Search_Simple.php?lng=EN';
        const OMIM_HTTP_URL  = 'https://omim.org/entry/';
        const {disease} = this.props;
        const [disease_type, disease_id]   = disease.split(':')
            .map(d => {return d.toUpperCase()});
        
        return (
            <span>
                {/* ORPHANET : has to be a form */}
                {disease_type === 'ORPHA' && 
                    <form style={{display:'inline',whiteSpace:'nowrap'}} target="_blank" action={ORPHA_FORM_URL} method='POST'> 
                    <input type="hidden" name="Disease_Disease_Search_diseaseGroup" value={disease_id}/>
                    <input type="hidden" name="Disease_Disease_Search_diseaseType" value="ORPHA"/>
                    <input style={inputStyleRemoval}
                        type="submit" value={disease}/>
                    </form>
                }
                
                {/* OMIM : is just a link */}
                {disease_type === 'OMIM' && 
                    <a target='_blank' 
                       rel="noopener noreferrer"
                       href={`${OMIM_HTTP_URL}${disease_id}`}>{disease}</a>
                }
                
                {['ORPHA', 'OMIM'].indexOf(disease_type) === -1 && 
                    <span>{disease}</span>
                }
            </span>
        )
    }
}

export default DiseaseLink;