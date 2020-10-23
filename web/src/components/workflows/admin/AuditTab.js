import React, { PureComponent } from 'react';
import { Button } from 'antd';

class AuditTab extends PureComponent {
    render() {
        return (
            <div>
                <Button type='primary' size='large' onClick={this.handleLogout}>DOWNLOAD</Button>
            </div>
        )
    }
}

export default AuditTab