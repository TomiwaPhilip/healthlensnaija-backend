const React = require("react");
const { useState, useEffect } = require("react");
const axios = require("axios");

const Notifications = function () {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // "all", "read", "unread"
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch notifications with optional filters and pagination
  const fetchNotifications = async (page = 1) => {
    try {
      const response = await axios.get("/api/notifications", {
        params: { filter, search: searchQuery, page },
      });
      setNotifications(response.data.notifications);
      setTotalPages(response.data.totalPages);
      setCurrentPage(response.data.currentPage);
    } catch (err) {
      const errMsg =
        (err.response && err.response.data && err.response.data.message) ||
        err.message ||
        "Error fetching notifications";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Fetch notifications on component mount or when filter/search changes
  useEffect(() => {
    fetchNotifications();
  }, [filter, searchQuery]);

  // Mark a notification as read/unread
  const toggleReadStatus = async (id, isRead) => {
    try {
      await axios.patch(`/api/notifications/${id}`, { isRead: !isRead });
      fetchNotifications(currentPage); // Refresh the list
    } catch (err) {
      setError("Failed to update notification status.");
    }
  };

  // Delete a notification
  const deleteNotification = async (id) => {
    try {
      await axios.delete(`/api/notifications/${id}`);
      fetchNotifications(currentPage); // Refresh the list
    } catch (err) {
      setError("Failed to delete notification.");
    }
  };

  // Clear all notifications
  const clearAllNotifications = async () => {
    try {
      await axios.delete("/api/notifications");
      setNotifications([]); // Clear the list
    } catch (err) {
      setError("Failed to clear notifications.");
    }
  };

  // Export notifications as CSV
  const exportCSV = () => {
    if (notifications.length === 0) return;
    const headers = ["ID", "Title", "Message", "Created At", "Status"];
    const rows = notifications.map((notification) => {
      return `${notification._id},${notification.title},${notification.message},${new Date(
        notification.createdAt
      ).toLocaleString()},${notification.isRead ? "Read" : "Unread"}`;
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", "notifications.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return React.createElement("p", null, "Loading notifications...");
  }

  if (error) {
    return React.createElement("p", { style: { color: "red" } }, "Error: ", error);
  }

  return React.createElement(
    "div",
    { style: { padding: "20px" } },
    React.createElement("h1", null, "Notifications"),
    // Filter and Search Controls
    React.createElement(
      "div",
      { style: { marginBottom: "20px" } },
      React.createElement(
        "select",
        {
          value: filter,
          onChange: (e) => setFilter(e.target.value),
          style: { marginRight: "10px", padding: "5px" },
        },
        React.createElement("option", { value: "all" }, "All"),
        React.createElement("option", { value: "read" }, "Read"),
        React.createElement("option", { value: "unread" }, "Unread")
      ),
      React.createElement("input", {
        type: "text",
        placeholder: "Search notifications...",
        value: searchQuery,
        onChange: (e) => setSearchQuery(e.target.value),
        style: { marginRight: "10px", padding: "5px" },
      }),
      React.createElement(
        "button",
        {
          onClick: clearAllNotifications,
          style: { marginRight: "10px", padding: "5px 10px" },
        },
        "Clear All"
      ),
      React.createElement(
        "button",
        {
          onClick: exportCSV,
          style: { padding: "5px 10px" },
        },
        "Export CSV"
      )
    ),
    // Notifications List
    notifications.length === 0
      ? React.createElement("p", null, "No notifications at this time.")
      : React.createElement(
          "ul",
          { style: { listStyleType: "none", padding: 0 } },
          notifications.map((notification) =>
            React.createElement(
              "li",
              {
                key: notification._id,
                style: {
                  marginBottom: "10px",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  backgroundColor: notification.isRead ? "#f9f9f9" : "#e3f2fd",
                },
              },
              React.createElement("strong", null, notification.title),
              React.createElement("p", null, notification.message),
              React.createElement(
                "small",
                null,
                new Date(notification.createdAt).toLocaleString()
              ),
              React.createElement(
                "div",
                { style: { marginTop: "10px" } },
                React.createElement(
                  "button",
                  {
                    onClick: () =>
                      toggleReadStatus(notification._id, notification.isRead),
                    style: { marginRight: "10px", padding: "5px 10px" },
                  },
                  notification.isRead ? "Mark as Unread" : "Mark as Read"
                ),
                React.createElement(
                  "button",
                  {
                    onClick: () => deleteNotification(notification._id),
                    style: { padding: "5px 10px", backgroundColor: "#ffebee" },
                  },
                  "Delete"
                )
              )
            )
          )
        ),
    // Pagination Controls
    React.createElement(
      "div",
      { style: { textAlign: "center", marginTop: "20px" } },
      React.createElement(
        "button",
        {
          onClick: () => {
            if (currentPage > 1) {
              setCurrentPage(currentPage - 1);
              fetchNotifications(currentPage - 1);
            }
          },
          disabled: currentPage === 1,
          style: { marginRight: "10px", padding: "5px 10px" },
        },
        "Previous"
      ),
      React.createElement(
        "span",
        { style: { margin: "0 10px" } },
        `Page ${currentPage} of ${totalPages}`
      ),
      React.createElement(
        "button",
        {
          onClick: () => {
            if (currentPage < totalPages) {
              setCurrentPage(currentPage + 1);
              fetchNotifications(currentPage + 1);
            }
          },
          disabled: currentPage === totalPages,
          style: { padding: "5px 10px" },
        },
        "Next"
      )
    )
  );
};

module.exports = Notifications;