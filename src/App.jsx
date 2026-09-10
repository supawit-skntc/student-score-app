import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import DeductionForm from './pages/DeductionForm';
import Report from './pages/Report';
import StudentProfile from './pages/StudentProfile';
import UserManagement from './pages/UserManagement';
import AuditLog from './pages/AuditLog';
import { isAdmin } from './utils/permissions';

export default function App() {
  const [view, setView] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [profileStudentId, setProfileStudentId] = useState(null);

  // ใช้กับปุ่ม "ดูประวัติ" ในหน้า Dashboard/Report เพื่อพาไปหน้าประวัตินักเรียน
  // พร้อมเลือกคนนั้นให้เลยโดยไม่ต้องพิมพ์ค้นหาซ้ำ
  const goToProfile = (studentId) => {
    setProfileStudentId(studentId);
    setView('profile');
  };

  useEffect(() => {
    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));
  }, [view]);

  // ป้องกันชั้นที่ 2 ฝั่ง frontend: ถ้า state หลุดไปเป็นหน้า admin-only ทั้งที่ role ไม่ใช่ admin
  // ให้เด้งกลับ dashboard เสมอ — ทั้งนี้การตรวจสอบสิทธิ์จริงต้องทำที่ฝั่ง GAS backend ด้วย
  // ทุกครั้งที่เรียก action เช่น createUser/updateUser/deleteUser ห้ามเชื่อ client อย่างเดียว
  useEffect(() => {
    if ((view === 'users' || view === 'auditlog') && !isAdmin(currentUser)) {
      setView('dashboard');
    }
  }, [view, currentUser]);

  return (
    <div>
      {view === 'login' && <Login setView={setView} />}

      {view !== 'login' && (
        <DashboardLayout setView={setView} view={view}>

          {view === 'dashboard' && <Dashboard onViewStudent={goToProfile} />}

          {view === 'form' && <DeductionForm />}

          {view === 'report' && <Report onViewStudent={goToProfile} />}

          {view === 'profile' && <StudentProfile initialStudentId={profileStudentId} />}

          {view === 'users' && isAdmin(currentUser) && <UserManagement />}

          {view === 'auditlog' && isAdmin(currentUser) && <AuditLog />}

        </DashboardLayout>
      )}
    </div>
  );
}
