import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MeetingIntelligenceOverview } from './MeetingIntelligenceOverview';
import { MeetingDetailView } from './MeetingDetailView';
import { Meeting } from '../types';

export const MeetingIntelligenceView: React.FC = () => {
  const { meetings, currentUser, openDmWithUser } = useApp();

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // Strict user-based filtering: ONLY show meetings where currentUser is in participants!
  const currentUserMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (!m.participants) return false;
      return m.participants.some(p => {
        const pName = typeof p === 'string' ? p : (p as any).name || '';
        return pName.toLowerCase().includes(currentUser.name.toLowerCase()) ||
               currentUser.name.toLowerCase().includes(pName.toLowerCase());
      });
    });
  }, [meetings, currentUser]);

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setSelectedMeetingId(meeting.id);
  };

  const handleBackToOverview = () => {
    setSelectedMeetingId(null);
    setSelectedMeeting(null);
  };

  const handleSendDirectMessage = (recipientName: string, text: string) => {
    openDmWithUser(recipientName);
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto px-8 py-6 animate-fade-in font-sans">
      {selectedMeetingId && (selectedMeeting || currentUserMeetings.find(m => m.id === selectedMeetingId)) ? (
        <MeetingDetailView
          selectedMeetingId={selectedMeetingId}
          meeting={selectedMeeting || undefined}
          meetings={currentUserMeetings}
          currentUser={currentUser}
          onBackToDashboard={handleBackToOverview}
          onSendDirectMessage={handleSendDirectMessage}
        />
      ) : (
        <MeetingIntelligenceOverview
          meetings={currentUserMeetings}
          onSelectMeeting={handleSelectMeeting}
          onSelectMeetingId={setSelectedMeetingId}
        />
      )}
    </div>
  );
};

