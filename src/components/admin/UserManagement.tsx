"use client";

import {
  CalendarDays,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  addUser,
  deleteUser,
  getUsers,
  updateUserAccess,
  updateUserPizzaCount,
  updateUserRoles,
  updateUserTenure,
} from "@/lib/actions/user";
import type { AppResult } from "@/lib/api/result";
import {
  ACCESS_LEVELS,
  CLUB_POSITIONS,
  CURRENT_TENURE,
  MODULE_POSITIONS,
  MODULES,
  type AccessLevel,
  type ModuleName,
  type UserRole,
} from "@/lib/constants";

import Modal from "@/components/shared/Modal";
import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";

import styles from "./UserManagement.module.scss";

interface AdminUser {
  _id: string;
  name?: string;
  email: string;
  access?: AccessLevel;
  tenure?: string;
  managedModules?: ModuleName[];
  roles?: UserRole[];
  pizza_count?: number;
}

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleUser, setRoleUser] = useState<AdminUser | null>(null);
  const [tempRoles, setTempRoles] = useState<UserRole[]>([]);
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null);
  const [tempAccess, setTempAccess] = useState<AccessLevel>("Member");
  const [tempManagedModules, setTempManagedModules] = useState<ModuleName[]>(
    [],
  );
  const [tenureUser, setTenureUser] = useState<AdminUser | null>(null);
  const [tempTenure, setTempTenure] = useState(CURRENT_TENURE);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const result = await getUsers(page, 50, search);
    if (result.ok) {
      setUsers(result.data.users);
      setTotalPages(Math.max(1, Math.ceil(result.data.total / 50)));
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function run(result: Promise<AppResult<unknown>>) {
    const value = await result;
    if (!value.ok) {
      alert(value.error.message);
      return false;
    }
    await fetchUsers();
    return true;
  }

  function openAccessEditor(user: AdminUser, access = user.access || "Member") {
    setAccessUser(user);
    setTempAccess(access);
    setTempManagedModules(user.managedModules || []);
  }

  function toggleManagedModule(module: ModuleName) {
    setTempManagedModules((current) =>
      current.includes(module)
        ? current.filter((item) => item !== module)
        : [...current, module],
    );
  }

  async function saveAccess() {
    if (!accessUser) return;
    if (tempAccess === "Head" && tempManagedModules.length === 0) {
      alert("Select at least one module for Head access.");
      return;
    }
    const changingToHead =
      tempAccess === "Head" && accessUser.access !== "Head";
    if (
      changingToHead &&
      accessUser.roles?.length &&
      !confirm(
        "Head roles are generated from managed modules. Existing custom roles will be cleared. Continue?",
      )
    ) {
      return;
    }
    if (
      tempAccess !== "Head" &&
      accessUser.managedModules?.length &&
      !confirm("Changing access will clear managed modules. Continue?")
    ) {
      return;
    }
    if (
      await run(
        updateUserAccess(
          accessUser._id,
          tempAccess,
          tempAccess === "Head" ? tempManagedModules : [],
        ),
      )
    ) {
      setAccessUser(null);
    }
  }

  function openRoleEditor(user: AdminUser) {
    setRoleUser(user);
    setTempRoles(user.roles || []);
  }

  function setRoleMode(index: number, module: string) {
    const next = [...tempRoles] as UserRole[];
    next[index] = module
      ? { module: module as ModuleName, position: MODULE_POSITIONS[0] }
      : { position: CLUB_POSITIONS[0] };
    setTempRoles(next);
  }

  function openTenureEditor(user: AdminUser) {
    setTenureUser(user);
    setTempTenure(user.tenure || CURRENT_TENURE);
  }

  const closeModals = () => {
    setRoleUser(null);
    setAccessUser(null);
    setTenureUser(null);
  };

  if (loading && users.length === 0) {
    return <TableSkeletonContent label="users" columns={6} />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.addUserSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Add a member</h3>
            <p>New members start with Member access and the current tenure.</p>
          </div>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(addUser(newEmail, newName))) {
              setNewEmail("");
              setNewName("");
            }
          }}
        >
          <div className={styles.field}>
            <label htmlFor="new-user-email">Email</label>
            <input
              id="new-user-email"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="member@iitg.ac.in"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="new-user-name">Name</label>
            <input
              id="new-user-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <button type="submit">Add member</button>
        </form>
      </div>

      <div className={styles.toolbar}>
        <SearchInput
          placeholder="Search by name or email"
          value={searchInput}
          onChange={setSearchInput}
          onSearch={(value) => {
            setPage(1);
            setSearch(value);
          }}
          className={styles.searchInput}
        />
        <span className={styles.resultCount}>{users.length} shown</span>
      </div>

      {loading ? (
        <TableSkeletonContent label="users" columns={6} />
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Access</th>
                  <th>Roles</th>
                  <th>Tenure</th>
                  <th>Pizza</th>
                  <th>
                    <span className={styles.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isAccessHead = user.access === "Head";
                  return (
                    <tr key={user._id}>
                      <td>
                        <div className={styles.memberCell}>
                          <strong>{user.name || "Unnamed member"}</strong>
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.accessCell}>
                          <select
                            className={styles.roleSelect}
                            value={user.access || "Member"}
                            aria-label={`Access for ${user.name || user.email}`}
                            onChange={(event) =>
                              openAccessEditor(
                                user,
                                event.target.value as AccessLevel,
                              )
                            }
                          >
                            {ACCESS_LEVELS.map((access) => (
                              <option key={access}>{access}</option>
                            ))}
                          </select>
                          {isAccessHead && (
                            <button
                              type="button"
                              className={styles.inlineAction}
                              onClick={() => openAccessEditor(user)}
                            >
                              <Settings2 size={13} /> Manage modules
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.rolesCell}>
                          {isAccessHead ? (
                            user.managedModules?.map((module) => (
                              <span className={styles.roleBadge} key={module}>
                                {module} <strong>Head</strong>
                              </span>
                            ))
                          ) : user.roles?.length ? (
                            user.roles.map((role, index) => (
                              <span
                                className={styles.roleBadge}
                                key={`${role.module || "club"}-${role.position}-${index}`}
                              >
                                {role.module ? `${role.module} · ` : ""}
                                <strong>{role.position}</strong>
                              </span>
                            ))
                          ) : (
                            <span className={styles.emptyValue}>
                              No role assigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={styles.tenureValue}>
                          {user.tenure || "Not configured"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.pizzaControls}>
                          <button
                            type="button"
                            className={styles.pizzaButton}
                            disabled={!user.pizza_count}
                            aria-label={`Remove pizza from ${user.name || user.email}`}
                            onClick={() =>
                              void run(updateUserPizzaCount(user._id, -1))
                            }
                          >
                            −
                          </button>
                          <span className={styles.pizzaCount}>
                            {user.pizza_count || 0}
                          </span>
                          <button
                            type="button"
                            className={styles.pizzaButton}
                            aria-label={`Add pizza to ${user.name || user.email}`}
                            onClick={() =>
                              void run(updateUserPizzaCount(user._id, 1))
                            }
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className={styles.actionMenu}>
                          {!isAccessHead && (
                            <button
                              type="button"
                              className={styles.iconButton}
                              aria-label={`Edit roles for ${user.name || user.email}`}
                              title="Edit roles"
                              onClick={() => openRoleEditor(user)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={`Edit tenure for ${user.name || user.email}`}
                            title="Edit tenure"
                            onClick={() => openTenureEditor(user)}
                          >
                            <CalendarDays size={15} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconButton} ${styles.dangerButton}`}
                            aria-label={`Delete ${user.name || user.email}`}
                            title="Delete member"
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to delete this user?",
                                )
                              )
                                void run(deleteUser(user._id));
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {accessUser && (
        <Modal
          kicker="Users"
          title="Access and modules"
          description={accessUser.name || accessUser.email}
          onClose={closeModals}
          maxWidth={520}
          footer={
            <>
              <button className={styles.cancel} onClick={closeModals}>
                Cancel
              </button>
              <button className={styles.save} onClick={() => void saveAccess()}>
                <Save size={16} /> Save access
              </button>
            </>
          }
        >
          <div className={styles.modalBody}>
            <label className={styles.modalLabel} htmlFor="access-level">
              Access
            </label>
            <select
              id="access-level"
              className={styles.fullSelect}
              value={tempAccess}
              onChange={(event) => {
                const access = event.target.value as AccessLevel;
                setTempAccess(access);
                if (access !== "Head") setTempManagedModules([]);
              }}
            >
              {ACCESS_LEVELS.map((access) => (
                <option key={access}>{access}</option>
              ))}
            </select>
            {tempAccess === "Head" && (
              <fieldset className={styles.modulePicker}>
                <legend>Managed modules</legend>
                <p>Select every module this Head is allowed to manage.</p>
                {MODULES.map((module) => (
                  <label key={module}>
                    <input
                      type="checkbox"
                      checked={tempManagedModules.includes(module)}
                      onChange={() => toggleManagedModule(module)}
                    />
                    <span>{module}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </Modal>
      )}

      {roleUser && (
        <Modal
          kicker="Users"
          title="Edit roles"
          description={roleUser.name || roleUser.email}
          onClose={closeModals}
          maxWidth={520}
          footer={
            <>
              <button className={styles.cancel} onClick={closeModals}>
                Cancel
              </button>
              <button
                className={styles.save}
                onClick={async () => {
                  if (await run(updateUserRoles(roleUser._id, tempRoles)))
                    setRoleUser(null);
                }}
              >
                <Save size={16} /> Save roles
              </button>
            </>
          }
        >
          <div className={styles.modalBody}>
            {tempRoles.length === 0 && (
              <p className={styles.modalEmpty}>No roles assigned yet.</p>
            )}
            {tempRoles.map((role, index) => (
              <div key={index} className={styles.moduleRoleItem}>
                <select
                  aria-label="Module"
                  value={role.module || ""}
                  onChange={(event) => setRoleMode(index, event.target.value)}
                >
                  <option value="">Club-wide</option>
                  {MODULES.map((module) => (
                    <option key={module}>{module}</option>
                  ))}
                </select>
                <select
                  aria-label="Position"
                  value={role.position}
                  onChange={(event) => {
                    const next = [...tempRoles] as UserRole[];
                    next[index] = {
                      ...next[index],
                      position: event.target.value,
                    } as UserRole;
                    setTempRoles(next);
                  }}
                >
                  {(role.module ? MODULE_POSITIONS : CLUB_POSITIONS).map(
                    (position) => (
                      <option key={position}>{position}</option>
                    ),
                  )}
                </select>
                <button
                  className={styles.removeRoleButton}
                  aria-label="Remove role"
                  onClick={() =>
                    setTempRoles(
                      tempRoles.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <button
              className={styles.addModuleRole}
              onClick={() =>
                setTempRoles([...tempRoles, { position: CLUB_POSITIONS[0] }])
              }
            >
              <Plus size={14} /> Add role
            </button>
          </div>
        </Modal>
      )}

      {tenureUser && (
        <Modal
          kicker="Users"
          title="Edit tenure"
          description={tenureUser.name || tenureUser.email}
          onClose={closeModals}
          maxWidth={410}
          footer={
            <>
              <button className={styles.cancel} onClick={closeModals}>
                Cancel
              </button>
              <button
                className={styles.save}
                onClick={async () => {
                  if (await run(updateUserTenure(tenureUser._id, tempTenure)))
                    setTenureUser(null);
                }}
              >
                <Save size={16} /> Save tenure
              </button>
            </>
          }
        >
          <div className={styles.modalBody}>
            <label className={styles.modalLabel} htmlFor="tenure-value">
              Academic year
            </label>
            <div className={styles.tenureInput}>
              <CalendarDays size={17} />
              <input
                id="tenure-value"
                value={tempTenure}
                onChange={(event) => setTempTenure(event.target.value)}
                placeholder="2026-27"
                pattern="\d{4}-\d{2}"
                autoFocus
              />
            </div>
            <p className={styles.fieldHint}>
              Use the format YYYY-YY, for example 2026-27.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
