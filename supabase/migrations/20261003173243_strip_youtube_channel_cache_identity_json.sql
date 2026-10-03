-- Remove channel profile/name/avatar mirrors from YouTube channel-cache item JSON.
-- Keep channelId/_sourceId and all video-level metadata.
with cleaned as (
  select
    c.profile_key,
    c.channel_id,
    coalesce(
      jsonb_agg(
        (
          elem
          - '_sourceName'
          - '_sourceThumbnailUrl'
          - 'sourceName'
          - 'sourceAvatar'
          - 'uploader'
          - 'uploaderName'
          - 'uploaderAvatar'
          - 'uploaderThumbnailUrl'
          - 'uploaderUrl'
          - 'uploaderVerified'
          - 'channelName'
          - 'channelThumbnailUrl'
          - 'channelAvatar'
          - 'channelUrl'
        )
        order by ord
      ) filter (where elem is not null),
      '[]'::jsonb
    ) as items
  from public.yt1988_channel_cache c
  left join lateral jsonb_array_elements(
    case when jsonb_typeof(c.items)='array' then c.items else '[]'::jsonb end
  ) with ordinality as e(elem,ord) on true
  group by c.profile_key,c.channel_id
)
update public.yt1988_channel_cache c
set items=cleaned.items
from cleaned
where c.profile_key=cleaned.profile_key
  and c.channel_id=cleaned.channel_id
  and c.items is distinct from cleaned.items;
