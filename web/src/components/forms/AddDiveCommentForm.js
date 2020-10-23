import React, { PureComponent } from 'react';
import { Form, Input, Button, Card, Typography, Row, Alert} from 'antd';

const { TextArea } = Input;
const { Text } = Typography;

const HELP_MESSAGE = <div>
    <span><b>Comment with any insights about your patient’s disease</b> , such as:</span>
    <ul>
        <li>phenotype severity, age of onset/disappearance, etc.</li>
        <li>prevalence in family (e.g., 1 sister affected, 2 brothers unaffected; mom may have had [symptom x] at birth, gone by age 2y'...) and/or ancestral background (e.g., &lt;5% prevalence in Puerto Ricans)</li>
        <li>other details of disease origin and/or course (e.g., parental ages at birth, noteworthy environmental exposures)</li>
    </ul>
</div>

class AddDiveCommentForm extends PureComponent {
    constructor(props) {
        super(props);

        this.state = {
            submit_disabled: true,
            comment: 'No comment' 
        }
    }

    componentDidMount() {
        this.props.form.setFieldsValue({comment: this.props.comment});
        this.setState({comment: this.props.comment});
    }

    componentDidUpdate(prevProps) {
        if (prevProps.comment !== this.props.comment && !this.props.disabled) {
            this.props.form.setFieldsValue({comment: this.props.comment});
            this.setState({comment: this.props.comment});
        }
    }

    handleCommentChange = (e) => {
        this.setState({
            submit_disabled:false
        })
    }

    handeSubmit = (e) => {
        e.preventDefault();
        this.props.form.validateFields().then(result => {
            const body = this.props.form.getFieldsValue();
            const {analysis_id} = this.props;
            const new_comment = body.comment; 

            this.props.onCommentUpdate(analysis_id, new_comment);
            // somewhat disconnected.
            this.setState({
                submit_disabled:true
            })

        }).catch(error => {
            // do nothing
        });
    }

    render() {
        const { getFieldDecorator } = this.props.form;
        const { submit_disabled, comment } = this.state;
        const { disabled, showInfo} = this.props; 

        return (
            <div style={{marginTop:20}}>
                {!disabled ?
                    <Form onSubmit={this.handeSubmit} className="add-dive-comment-form">
                        <h3>Add Comment</h3>
                        {showInfo && <Row style={{marginBottom:20}}
                            ><Alert description={HELP_MESSAGE} type="info" showIcon/>
                        </Row>}

                        <Form.Item>
                        {getFieldDecorator('comment', {
                            rules: []
                        })(<TextArea
                            rows={5} onChange={this.handleCommentChange}/>)}
                        </Form.Item>
                        
                        <Form.Item style={{textAlign:'right'}}>
                            <Button type='primary' 
                            disabled={submit_disabled}
                            htmlType="submit">UPDATE COMMENT</Button>
                        </Form.Item>
                    </Form>
                    : 
                    <Card size="small" title="Comment">
                        <Text>{comment}</Text>
                    </Card>}
            </div>
        )
    }
}

export default (Form.create({ name: 'add-dive-comment' })(AddDiveCommentForm));