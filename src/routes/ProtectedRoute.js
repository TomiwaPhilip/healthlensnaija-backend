import React from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  if (!token) {
    alert("You are not logged in. Please sign in.");
    return <Navigate to="/signin" />;
  }

  return children;
};

export default ProtectedRoute;
