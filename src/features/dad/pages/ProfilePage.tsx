import SectionCard from '../components/SectionCard'

interface ProfilePageProps {
  member: { name: string; role: 'dad' | 'mom' | 'admin' }
}

const ROLE_DESCRIPTIONS: Record<ProfilePageProps['member']['role'], string> = {
  dad: 'Can view and manage own health & activity records',
  mom: 'Can view and manage own health & activity records',
  admin: 'Can view and manage every family member\'s records, plus own',
}

export default function ProfilePage({ member }: ProfilePageProps) {
  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Profile / Settings</h1>
      </div>

      <SectionCard title="About This Profile">
        <div className="dad-profile-row">
          <span className="dad-profile-label">Name</span>
          <span>{member.name}</span>
        </div>
        <div className="dad-profile-row">
          <span className="dad-profile-label">Role</span>
          <span>{ROLE_DESCRIPTIONS[member.role]}</span>
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
        Editable preferences and notification settings aren't built yet.
      </p>
    </div>
  )
}
