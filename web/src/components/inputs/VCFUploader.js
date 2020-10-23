import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { Upload, message, Radio } from 'antd';
import {authHeader} from '../../helpers';
import '../styles/VCFUploader.css';

const Dragger = Upload.Dragger;

// TODO: should we accept multiple VCF files?
// short answer : no 
class VCFUploader extends PureComponent {

    render() {
        const {authInfo, patient, assembly,
               onChangeAssembly, onChangeVCF} = this.props;

        const settings = {
          name: 'vcf',
          accept:'.vcf,.gz',
          multiple: false,
          action: `/upload/vcf/${patient.id}`,
          headers: {...authHeader()},
          onChange(info) {
            const status = info.file.status;
            if (status === 'done') {
              message.success(`${info.file.name} file uploaded successfully`);
              onChangeVCF(info.file.response.vcf_namespace)

            } else if (status === 'error') {
              message.error(`${info.file.name} file upload failed`);
            }
          },
        };

        return(
            <div>
            <Radio.Group 
                style={{marginBottom:20}}
                onChange={(e) => onChangeAssembly(e.target.value)} value={assembly}>
                <Radio.Button value={"grch37"}>GRCh37 (hg19)</Radio.Button>
                <Radio.Button value={"grch38"}>GRCh38 (hg38)</Radio.Button>
            </Radio.Group>  
              
            {authInfo && <Dragger {...settings}>
                <div style={{minHeight:235}}> 
                  <p className="ant-upload-text">Click or drag VCF file to this area to upload</p>
                </div>
            </Dragger>}
            </div>
        )
    }
}

function mapStateToProps(store, ownProps) {
  const { Auth } = store;
  return {
    authInfo: Auth.info
   }
}

export default connect(
    mapStateToProps
)(VCFUploader);

// - [WORKED AROUND] Interesting GraphQL doesn't support UPLOAD 
// https://groups.google.com/forum/#!topic/sangria-graphql/nhIewAHZc_I
// GENIUS: https://gist.github.com/dwhitney/d50a47d8431ec18f6b32
// https://davidfrancoeur.com/post/akka-http-multipart-form/
