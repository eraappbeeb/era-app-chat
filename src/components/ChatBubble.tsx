import React from 'react';
import { Check, CheckCheck, ExternalLink, MapPin } from 'lucide-react';
import { formatMessageTime } from '../lib/utils';
import type { ChatMessage } from '../types/chat';

interface ChatBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onImageClick?: (url: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  onImageClick,
}) => {
  const timeStr = formatMessageTime(message.createdAt);
  const isRead = !!message.readAt;

  // Exact Telegram-style bubble corner logic
  const bubbleRadius = isOwn
    ? [
        'rounded-l-[18px]',
        isFirstInGroup ? 'rounded-tr-[18px]' : 'rounded-tr-[5px]',
        isLastInGroup ? 'rounded-br-[4px]' : 'rounded-br-[5px]',
      ].join(' ')
    : [
        'rounded-r-[18px]',
        isFirstInGroup ? 'rounded-tl-[18px]' : 'rounded-tl-[5px]',
        isLastInGroup ? 'rounded-bl-[4px]' : 'rounded-bl-[5px]',
      ].join(' ');

  const renderStatus = (overlay = false) => {
    if (!isOwn) {
      return (
        <span
          className={`text-[11px] font-mono-num leading-none select-none ${
            overlay ? 'text-white/95' : 'text-zinc-400 dark:text-zinc-500'
          }`}
        >
          {timeStr}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-mono-num leading-none select-none ${
          overlay ? 'text-white/95' : 'text-white/80'
        }`}
      >
        <span>{timeStr}</span>
        {isRead ? (
          <CheckCheck className="w-[15px] h-[15px] text-white" strokeWidth={2.2} />
        ) : (
          <Check className="w-[14px] h-[14px] text-white/75" strokeWidth={2.2} />
        )}
      </span>
    );
  };

  return (
    <div
      className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} ${
        isLastInGroup ? 'mb-2.5' : 'mb-0.5'
      }`}
    >
      <div
        className={`relative max-w-[82%] sm:max-w-[70%] md:max-w-[62%] transition-colors ${bubbleRadius} ${
          isOwn
            ? 'bg-[#A4133C] text-white shadow-[0_1px_2px_rgba(164,19,60,0.28)]'
            : 'bg-white dark:bg-[#1E1E1E] text-zinc-900 dark:text-[#F5F5F7] shadow-[0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
        }`}
      >
        {/* Telegram-exact SVG Bubble Tail on last message of consecutive group */}
        {isLastInGroup && isOwn && (
          <svg
            viewBox="0 0 11 20"
            width="11"
            height="20"
            aria-hidden="true"
            className="absolute -right-[8px] bottom-0 text-[#A4133C] pointer-events-none"
          >
            <path
              d="M0 0 L0 20 L11 20 C5.5 20 2 14.5 0 0 Z"
              fill="currentColor"
            />
          </svg>
        )}

        {isLastInGroup && !isOwn && (
          <svg
            viewBox="0 0 11 20"
            width="11"
            height="20"
            aria-hidden="true"
            className="absolute -left-[8px] bottom-0 text-white dark:text-[#1E1E1E] pointer-events-none"
          >
            <path
              d="M11 0 L11 20 L0 20 C5.5 20 9 14.5 11 0 Z"
              fill="currentColor"
            />
          </svg>
        )}

        {/* Photo Message */}
        {message.type === 'image' && message.mediaUrl && (
          <div className="p-1">
            <div className="relative overflow-hidden rounded-[14px] bg-black/20">
              <button
                type="button"
                onClick={() => onImageClick?.(message.mediaUrl!)}
                className="block w-full text-left cursor-pointer focus:outline-none"
              >
                <img
                  src={message.mediaUrl}
                  alt={message.text || 'Shared photo'}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="max-h-[340px] w-auto min-w-[180px] max-w-full object-cover rounded-[14px]"
                />
              </button>
              {!message.text && (
                <div className="absolute bottom-2 right-2 rounded-full bg-black/55 backdrop-blur-xs px-2 py-0.5 flex items-center">
                  {renderStatus(true)}
                </div>
              )}
            </div>
            {message.text && (
              <div className="px-2.5 pt-1.5 pb-1 text-[14.5px] leading-[1.42] break-words">
                <span>{message.text}</span>
                <span className="float-right ml-3 mt-1.5">{renderStatus()}</span>
              </div>
            )}
          </div>
        )}

        {/* Video Message */}
        {message.type === 'video' && message.mediaUrl && (
          <div className="p-1">
            <div className="relative overflow-hidden rounded-[14px] bg-black">
              <video
                src={message.mediaUrl}
                controls
                playsInline
                preload="metadata"
                className="max-h-[340px] w-full max-w-[320px] rounded-[14px]"
              />
            </div>
            <div className="px-2.5 pt-1.5 pb-1 text-[14.5px] leading-[1.42] break-words flex items-end justify-between gap-3">
              <span>{message.text || ''}</span>
              <span className="shrink-0">{renderStatus()}</span>
            </div>
          </div>
        )}

        {/* Location Message */}
        {message.type === 'location' &&
          typeof message.locationLat === 'number' &&
          typeof message.locationLng === 'number' && (
            <div className="p-1.5 w-[250px] sm:w-[270px]">
              <a
                href={`https://www.openstreetmap.org/?mlat=${message.locationLat}&mlon=${message.locationLng}#map=16/${message.locationLat}/${message.locationLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`block rounded-[13px] p-3 transition-colors ${
                  isOwn
                    ? 'bg-black/20 hover:bg-black/30 text-white'
                    : 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#2A2A2E] dark:hover:bg-[#323237] text-zinc-900 dark:text-white'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isOwn ? 'bg-white/20 text-white' : 'bg-[#A4133C]/15 text-[#A4133C]'
                    }`}
                  >
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {message.locationLabel || 'Shared Location'}
                    </div>
                    <div
                      className={`text-[11px] font-mono-num mt-0.5 ${
                        isOwn ? 'text-white/75' : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {message.locationLat.toFixed(5)}, {message.locationLng.toFixed(5)}
                    </div>
                  </div>
                </div>
                <div
                  className={`mt-2.5 pt-2 border-t flex items-center justify-between text-xs font-medium ${
                    isOwn
                      ? 'border-white/15 text-white/90'
                      : 'border-zinc-200 dark:border-zinc-700 text-[#A4133C]'
                  }`}
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </div>
              </a>
              <div className="flex justify-end px-1.5 pt-1">{renderStatus()}</div>
            </div>
          )}

        {/* Standard Text Message */}
        {message.type === 'text' && (
          <div className="px-3.5 py-2 text-[15px] leading-[1.42] break-words whitespace-pre-wrap">
            <span>{message.text}</span>
            <span className="inline-block w-[62px]" aria-hidden="true" />
            <span className="float-right -ml-[54px] mt-[5px] relative z-10">
              {renderStatus()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
