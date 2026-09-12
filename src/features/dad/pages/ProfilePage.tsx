import SectionCard from '../components/SectionCard'

// Placeholder only. Authentication, role-based access, and editable
// settings will be built once the backend is in place.
export default function ProfilePage() {
  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Profile / Settings</h1>
      </div>

      <SectionCard title="About This Profile">
        <div className="dad-profile-row">
          <span className="dad-profile-label">Name</span>
          <span>Dad</span>
        </div>
        <div className="dad-profile-row">
          <span className="dad-profile-label">Role</span>
          <span>Can view and manage own health &amp; activity records</span>
        </div>
        <div className="dad-profile-row">
          <span className="dad-profile-label">Preferred blood sugar unit</span>
          <span>mg/dL</span>
        </div>
        <div className="dad-profile-row">
          <span className="dad-profile-label">Preferred distance unit</span>
          <span>km</span>
        </div>
      </SectionCard>

      <p className="dad-page-note">
        Sign-in, password, and notification settings will be added once authentication is implemented.
      </p>
    </div>
  )
}
