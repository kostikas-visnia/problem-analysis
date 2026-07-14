import React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components/layouts";

export const Header = () => {
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" />
        <AppHeader.NavigationItem as={Link} to="/">
          Overview
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/entities/host">
          Hosts
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/entities/process">
          Process groups
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/entities/service">
          Services
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/entities/application">
          Applications
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/detectors">
          Detectors
        </AppHeader.NavigationItem>
      </AppHeader.Navigation>
    </AppHeader>
  );
};
