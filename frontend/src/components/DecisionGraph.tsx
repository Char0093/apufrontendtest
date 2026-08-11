import React from 'react';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import { GraphData, Meeting } from '../types';

interface DecisionGraphProps {
  data?: GraphData;
  meetings?: Meeting[];
  currentMeetingId?: string;
  onSelectMeetingId?: (meetingId: string) => void;
  onSendDirectMessage?: (recipientName: string, text: string) => void;
}

export const DecisionGraph: React.FC<DecisionGraphProps> = (props) => {
  return <KnowledgeGraphView {...props} />;
};

export default DecisionGraph;
