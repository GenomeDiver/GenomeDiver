import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { Menu, Row, Col, Card} from 'antd';
import GenericTable from '../../GenericTable';
import { listUsers, listInstitutions} from '../../../actions';
import AddUserForm from '../../forms/AddUserForm';
import RemoveUserForm from '../../forms/RemoveUserForm';

const sortOrder = [
    'key', 'last_name', 'first_name', 'username',
    'role', 'active', 'institution', 'email', 'mobile']

class UserTab extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            currentMenuKey:'add_user'
        }
    }
    componentDidMount() {
        if (!this.props.userData) {
            this.props.listUsers()
        }

        if (!this.props.institutionData) {
            this.props.listInstitutions()
        }
    }

    menuSelect = (e) => {
        this.setState({currentMenuKey:e.key});
    }

    render() {
        const {institutionData, userData} = this.props;
        const {currentMenuKey} = this.state;
        const flexStyle = {
            'display':'flex',
            'flexWrap':'wrap'
        }
        return (
            <div>
                <GenericTable data={this.props.userData} sortOrder={sortOrder}/>

                <Card>
                    <Row gutter={8} style={flexStyle}>
                        <Col span={6}>
                            <Menu style={{'height': '100%'}} theme='light' defaultSelectedKeys={[currentMenuKey]} defaultOpenKeys={[currentMenuKey]} mode="inline">
                                <Menu.ItemGroup key="g1" title="UPDATES">
                                    <Menu.Item onClick={this.menuSelect} key="add_user">Add User</Menu.Item>
                                    <Menu.Item onClick={this.menuSelect} key="remove_user">Remove User</Menu.Item>
                                    <Menu.Item key="update_user" disabled>Update User</Menu.Item>
                                </Menu.ItemGroup>
                            </Menu>
                        </Col>
                        <Col span={18}>
                             {currentMenuKey === 'add_user' &&
                                <AddUserForm key='add_user_form' institutionData={institutionData}/>}
                             {currentMenuKey === 'remove_user' &&
                                <RemoveUserForm key='remove_user_form' userData={userData}/>}
                        </Col>
                    </Row>
                </Card>
            </div>
         )
    }
}

function mapStateToProps(store, ownProps) {
  let {UserList, InstitutionList} = store;

  return {
      userData: UserList.data,
      institutionData: InstitutionList.data_admin
  };
}

function mapDispatchToProps(dispatch, ownProps) {
    return {
        listUsers: () => {
            dispatch(listUsers())
        },
        listInstitutions: () => {
            dispatch(listInstitutions())
        },
        addUser:({lastname, firstname, email, role, username, institutionId, mobile}) => {
            dispatch();
        }
    }
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UserTab);