import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, CheckCircle, AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onClose: () => void;
  isOpen: boolean;
  onReadNotification: (id: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onMarkAllAsRead,
  onClearAll,
  onClose,
  isOpen,
  onReadNotification,
}) => {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            id="notif-backdrop"
            className="fixed inset-0 bg-black/40 z-40 transition-opacity"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            id="notif-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col h-full border-l border-blue-100"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-blue-50 text-blue-900">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600 animate-pulse" />
                <h3 className="font-semibold text-lg text-blue-950 font-sans">
                  Notifications du Service ({unreadCount})
                </h3>
              </div>
              <button
                id="btn-close-notif"
                onClick={onClose}
                className="p-1.5 hover:bg-blue-100 rounded-full text-blue-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Actions Bar */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-50 flex justify-between text-xs bg-slate-50">
                <button
                  id="btn-read-all"
                  onClick={onMarkAllAsRead}
                  className="text-blue-700 hover:text-blue-900 font-medium transition cursor-pointer"
                >
                  Tout marquer comme lu
                </button>
                <button
                  id="btn-clear-all"
                  onClick={onClearAll}
                  className="text-red-600 hover:text-red-800 font-medium transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Tout effacer
                </button>
              </div>
            )}

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-slate-300" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-600">Aucune notification</p>
                    <p className="text-xs text-slate-400 max-w-[240px] mt-1">
                      Les changements de statut de vos commandes s'afficheront ici en temps réel.
                    </p>
                  </div>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-xl border transition flex gap-3 ${
                      notif.read
                        ? 'bg-white border-gray-100 text-gray-500'
                        : 'bg-blue-50/50 border-blue-100 text-gray-800 shadow-sm'
                    }`}
                    onClick={() => onReadNotification(notif.id)}
                  >
                    {/* Icon based on notification type */}
                    <div className="mt-0.5 shrink-0">
                      {notif.type === 'success' && (
                        <CheckCircle className="w-5 h-5 text-blue-500" />
                      )}
                      {notif.type === 'warning' && (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      )}
                      {notif.type === 'alert' && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      {notif.type === 'info' && (
                        <Info className="w-5 h-5 text-blue-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-1">
                        <p className={`font-semibold text-sm ${notif.read ? 'text-gray-700' : 'text-blue-950'}`}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        {notif.message}
                      </p>
                      
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-gray-400 font-mono">
                          {new Date(notif.timestamp).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        {notif.orderId && (
                          <span className="text-[9px] px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded-full">
                            #{notif.orderId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Notification information */}
            <div className="p-4 bg-slate-50 border-t border-gray-100 text-xs text-slate-500">
              <p className="font-medium text-slate-700 mb-1">Suivi des commandes en direct :</p>
              <p>Chaque modification opérée sur une commande par le restaurant ou le livreur produit une notification instantanée.</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Global Toast Popup Container for active page overlay
interface ActiveToastProps {
  toast: AppNotification | null;
  onDismiss: () => void;
}

export const ActiveToast: React.FC<ActiveToastProps> = ({ toast, onDismiss }) => {
  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  return (
    <div className="fixed bottom-5 left-5 right-5 md:left-auto md:right-5 z-50 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="pointer-events-auto bg-slate-900 text-white rounded-xl shadow-2xl p-4 flex gap-3 items-start border border-slate-800"
          >
            <div className="mt-0.5">
              {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-blue-400" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {toast.type === 'alert' && <AlertCircle className="w-5 h-5 text-red-400" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-white font-sans">{toast.title}</h4>
              <p className="text-xs text-slate-300 mt-1">{toast.message}</p>
            </div>
            <button
              id="btn-dismiss-toast"
              onClick={onDismiss}
              className="text-slate-400 hover:text-white rounded-lg p-0.5 hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

