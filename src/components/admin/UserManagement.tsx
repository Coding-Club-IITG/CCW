"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, X, Save } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import Pagination from "@/components/shared/Pagination";
import { GLOBAL_ROLES as ROLES, MODULES, MODULE_ROLES } from "@/lib/constants";
import {
  addUser,
  deleteUser,
  getUsers,
  updateUserModuleRoles,
  updateUserPizzaCount,
  updateUserRole,
} from "@/lib/actions/user";
import { isGlobalAdmin, isModuleHead } from "@/lib/roles";
import styles from "./UserManagement.module.scss";

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Modal state
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [tempModuleRoles, setTempModuleRoles] = useState<any[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUsers(page, 50, search);
      if (result.success) {
        setUsers(result.users);
        setTotalPages(Math.ceil((result.total || result.users.length) / 50));
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  function handleSearch(searchTerm: string) {
    setPage(1);
    setSearch(searchTerm);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;

    const result = await addUser(newEmail, newName);
    if (!result.success) {
      alert(result.error);
    } else {
      setNewEmail("");
      setNewName("");
      void fetchUsers();
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const result = await updateUserRole(userId, newRole);
    if (!result.success) {
      alert(result.error);
    } else {
      void fetchUsers();
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    const result = await deleteUser(userId);
    if (!result.success) {
      alert(result.error);
    } else {
      void fetchUsers();
    }
  }

  function openModuleRoleModal(user: any) {
    setEditingUser(user);
    setTempModuleRoles([...(user.moduleRoles || [])]);
  }

  async function saveModuleRoles() {
    if (!editingUser) return;
    const result = await updateUserModuleRoles(
      editingUser._id,
      tempModuleRoles,
    );
    if (!result.success) {
      alert(result.error);
    } else {
      setEditingUser(null);
      void fetchUsers();
    }
  }

  function addTempModuleRole() {
    setTempModuleRoles([
      ...tempModuleRoles,
      { module: MODULES[0], role: MODULE_ROLES[0] },
    ]);
  }

  function updateTempModuleRole(index: number, field: string, value: string) {
    const updated = [...tempModuleRoles];
    updated[index] = { ...updated[index], [field]: value };
    setTempModuleRoles(updated);
  }

  function removeTempModuleRole(index: number) {
    setTempModuleRoles(tempModuleRoles.filter((_, i) => i !== index));
  }

  async function handlePizzaChange(userId: string, delta: 1 | -1) {
    const result = await updateUserPizzaCount(userId, delta);
    if (!result.success) {
      alert(result.error);
    } else {
      void fetchUsers();
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.addUserSection}>
        <h3>Add New User</h3>
        <form onSubmit={handleAddUser}>
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@iitg.ac.in"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Name (Optional)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="John Doe"
            />
          </div>
          <button type="submit">Add User</button>
        </form>
      </div>

      <>
        <div className={styles.toolbar}>
          <SearchInput
            placeholder="Search users by name or email"
            value={searchInput}
            onChange={setSearchInput}
            onSearch={handleSearch}
            className={styles.searchInput}
          />
        </div>
        {loading ? (
          <div className={styles.tableContainer}>
            <p className={styles.loadingState}>Loading users...</p>
          </div>
        ) : (
          <>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Global Role</th>
                    <th>Module Roles</th>
                    <th>Pizza</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          className={styles.roleSelect}
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user._id, e.target.value)
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <ul className={styles.moduleRolesList}>
                          {user.moduleRoles?.map((mr: any, idx: number) => (
                            <li key={idx}>
                              <span>{mr.module}</span>
                              <strong>{mr.role}</strong>
                            </li>
                          ))}
                        </ul>
                        {!isGlobalAdmin(user.role) && (
                          <div
                            className={styles.addModuleRole}
                            onClick={() => openModuleRoleModal(user)}
                          >
                            Edit Module Roles
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={styles.pizzaControls}>
                          <button
                            className={styles.pizzaButton}
                            onClick={() => handlePizzaChange(user._id, -1)}
                            disabled={!user.pizza_count}
                          >
                            −
                          </button>
                          <span className={styles.pizzaCount}>
                            {user.pizza_count || 0}
                          </span>
                          <button
                            className={styles.pizzaButton}
                            onClick={() => handlePizzaChange(user._id, 1)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDelete(user._id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </>

      {editingUser && (
        <>
          <div
            className={styles.overlay}
            onClick={() => setEditingUser(null)}
          />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Edit Module Roles</h2>
              <p>
                {editingUser.name} ({editingUser.email})
              </p>
            </div>
            <div className={styles.modalBody}>
              {tempModuleRoles.map((mr, idx) => (
                <div key={idx} className={styles.moduleRoleItem}>
                  <select
                    value={mr.module}
                    onChange={(e) =>
                      updateTempModuleRole(idx, "module", e.target.value)
                    }
                  >
                    {MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {!isModuleHead(editingUser.role) && (
                    <select
                      value={mr.role || ""}
                      onChange={(e) =>
                        updateTempModuleRole(idx, "role", e.target.value)
                      }
                    >
                      {MODULE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => removeTempModuleRole(idx)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                className={styles.addModuleRole}
                onClick={addTempModuleRole}
              >
                <Plus size={14} /> Add Module
              </button>
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.cancel}
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </button>
              <button className={styles.save} onClick={saveModuleRoles}>
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
