import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MessageCircle } from 'lucide-react';
import { subscribeToInbox } from './messageService';
import { FirebaseChatDrawer } from './FirebaseChatDrawer';

interface ChatUser {
  email: string;
  name: string;
  avatarUrl: string;
}

interface Props {
  myUser: ChatUser;
  initialTarget?: ChatUser | null;
  onTargetConsumed?: () => void;
}

export const ChatBubbleFAB: React.FC<Props> = ({ myUser, initialTarget, onTargetConsumed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [internalTarget, setInternalTarget] = useState<ChatUser | null>(null);

  // Subscribe to inbox – only care if there is ANY unread (red dot, no count)
  useEffect(() => {
    if (!myUser.email) return;
    const unsub = subscribeToInbox(myUser.email, (threads) => {
      setHasUnread(threads.some((t) => t.unreadCount > 0));
    });
    return () => unsub();
  }, [myUser.email]);

  // When a Direct Message button sets initialTarget, open the drawer at that thread
  useEffect(() => {
    if (initialTarget) {
      setInternalTarget(initialTarget);
      setIsOpen(true);
      onTargetConsumed?.();
    }
  }, [initialTarget?.email]);

  const handleOpen = () => {
    setInternalTarget(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setInternalTarget(null);
  };

  const portalContent = (
    <>
      {/* FAB button – hidden while drawer is open so it doesn't overlap send button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-full shadow-xl shadow-blue-600/40 flex items-center justify-center transition-all duration-200"
          title="Direct Messages"
        >
          <div className="relative">
            <MessageCircle className="w-6 h-6" />
            {/* Plain red dot – no number, just unseen indicator */}
            {hasUnread && (
              <span
                style={{ position: 'absolute', top: '-4px', right: '-4px' }}
                className="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm"
              />
            )}
          </div>
        </button>
      )}

      {/* Firebase Chat Drawer */}
      <FirebaseChatDrawer
        isOpen={isOpen}
        onClose={handleClose}
        myUser={myUser}
        initialTarget={internalTarget}
      />
    </>
  );

  return ReactDOM.createPortal(portalContent, document.body);
};
