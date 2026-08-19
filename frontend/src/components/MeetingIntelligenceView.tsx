import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MeetingIntelligenceOverview } from './MeetingIntelligenceOverview';
import { MeetingDetailView } from './MeetingDetailView';
import { Meeting } from '../types';

export const MeetingIntelligenceView: React.FC = () => {
  const { meetings, currentUser, openDmWithUser } = useApp();

  // Robust selectedMeetingId state with sessionStorage persistence across refreshes
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('cb_selected_meeting_id') || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (selectedMeetingId) {
        sessionStorage.setItem('cb_selected_meeting_id', selectedMeetingId);
      } else {
        sessionStorage.removeItem('cb_selected_meeting_id');
      }
    } catch {
      /* ignore */
    }
  }, [selectedMeetingId]);

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

  const selectedMeeting = useMemo(() => {
    if (!selectedMeetingId) return null;
    return meetings.find(m => m.id === selectedMeetingId) || null;
  }, [selectedMeetingId, meetings]);

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeetingId(meeting.id);
  };

  const handleBackToOverview = () => {
    setSelectedMeetingId(null);
  };

  const handleSendDirectMessage = (recipientName: string, text: string) => {
    openDmWithUser(recipientName);
  };

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 animate-fade-in font-sans">
      {selectedMeetingId && selectedMeeting ? (
        <MeetingDetailView
          selectedMeetingId={selectedMeetingId}
          meeting={selectedMeeting}
          meetings={meetings}
          currentUser={currentUser}
          onBackToDashboard={handleBackToOverview}
          onClose={handleBackToOverview}
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
