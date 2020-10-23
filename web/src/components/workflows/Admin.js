import React, { PureComponent } from 'react';
import { Tabs } from 'antd';
import "./Admin.css";

import InstitutionTab from './admin/InstitutionTab';
import UserTab from './admin/UserTab';
import AuditTab from './admin/AuditTab';

const TabPane = Tabs.TabPane;

/****************************
    Admin Workflow
*****************************/

class Admin extends PureComponent {
    render() {
        return (
           <div>
               <div className="card-container">
                   <Tabs defaultActiveKey="1" type="card">
                        <TabPane tab="INSTITUTIONS" key="1"><InstitutionTab/></TabPane>
                        <TabPane tab="USERS"        key="2"><UserTab/></TabPane>
                        <TabPane tab="AUDIT"        key="3"><AuditTab/></TabPane>
                  </Tabs>
              </div>
          </div>
        )
    }
}

export default Admin;
