import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import GenericTable from '../../GenericTable';
import { listInstitutions, addInstitution } from '../../../actions';
import AddInstitutionForm from '../../forms/AddInstitutionForm'
import {Card, Row, Col, Menu} from 'antd';

const sortOrder = ['key','name','type', 'active']

class InstitutionTab extends PureComponent {

    constructor(props) {
        super(props);
        this.state = {
            currentMenuKey:'add_institution'
        }
    }

    componentDidMount() {
        // if not available => download the list
        if (!this.props.data) {
            this.props.list()
        }
    }

    menuSelect = (e) => {
        this.setState({currentMenuKey:e.key});
    }

    render() {
        const {currentMenuKey} = this.state;
        const flexStyle = {
            'display':'flex',
            'flexWrap':'wrap'
        }
        return (
            <div>
                <GenericTable data={this.props.data} sortOrder={sortOrder}/>

                <Card>
                    <Row gutter={8} style={flexStyle}>
                        <Col span={6}>
                            <Menu style={{'height': '100%'}} theme='light' defaultSelectedKeys={[currentMenuKey]} defaultOpenKeys={[currentMenuKey]} mode="inline">
                                <Menu.ItemGroup key="g1" title="UPDATES">
                                    <Menu.Item onClick={this.menuSelect} key="add_institution">Add Institution</Menu.Item>
                                    <Menu.Item disabled onClick={this.menuSelect} key="remove_instititution">Remove Institution</Menu.Item>
                                </Menu.ItemGroup>
                            </Menu>
                        </Col>
                        <Col span={18}>
                            {currentMenuKey === 'add_institution' &&
                                <AddInstitutionForm key={currentMenuKey} addInstitution={this.props.addInstitution}/>}
                            {currentMenuKey === 'remove_institutions' &&
                                <div key={currentMenuKey}>TODO: Remove Institution</div>}
                        </Col>
                    </Row>
                </Card>
            </div>
        )
    }
}

function mapStateToProps(store, ownProps) {
  let {InstitutionList} = store;

  return {
      data: InstitutionList.data_admin
  };
}

function mapDispatchToProps(dispatch, ownProps) {
    return {
        list: () => {
            dispatch(listInstitutions());
        },
        addInstitution: ({institution, type}) => {
            dispatch(addInstitution({institution, type}));
        }
    }
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(InstitutionTab);
