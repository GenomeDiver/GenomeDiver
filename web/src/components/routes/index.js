import React from 'react';
import { Route, Redirect } from "react-router-dom";

export const PrivateRoute = ({ component: Component, ...rest }) => (
  <Route {...rest} render={(props) => (
     (props.authRole === props.routeRole) ? <Component {...props} /> : <Redirect to='/'/>
  )} />
)
