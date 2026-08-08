import os
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 
          'https://www.googleapis.com/auth/youtube']

class YouTubeUploader:
    def __init__(self, client_secrets_path='client_secrets.json', token_path='token.json'):
        self.client_secrets_path = client_secrets_path
        self.token_path = token_path
        self.service = None
    
    def authenticate(self):
        creds = None
        if os.path.exists(self.token_path):
            try:
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            except Exception as e:
                print(f"Token file load error: {e}")
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except Exception as e:
                    print(f"Token refresh failed: {e}")
                    creds = None
                    
            if not creds:
                if not os.path.exists(self.client_secrets_path):
                    print(f"Warning: {self.client_secrets_path} not found. YouTube upload won't work.")
                    return False
                try:
                    flow = InstalledAppFlow.from_client_secrets_file(self.client_secrets_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                except Exception as e:
                    print(f"OAuth flow failed: {e}")
                    return False
            
            if creds:
                with open(self.token_path, 'w') as token:
                    token.write(creds.to_json())
                
        if creds:
            self.service = build('youtube', 'v3', credentials=creds)
            return True
        return False
    
    def upload_video(
        self,
        video_path: str,
        title: str,
        description: str,
        tags: list,
        category_id: str = '24',
        privacy_status: str = 'private',
        publish_at: str = None,
        thumbnail_path: str = None
    ) -> dict:
        
        if not self.service:
            if not self.authenticate():
                raise Exception("Not authenticated with YouTube")
                
        body = {
            'snippet': {
                'title': title,
                'description': description,
                'tags': tags,
                'categoryId': category_id
            },
            'status': {
                'privacyStatus': privacy_status,
                'selfDeclaredMadeForKids': False
            }
        }
        
        if publish_at and privacy_status == 'private':
            body['status']['publishAt'] = publish_at

        media = MediaFileUpload(video_path, chunksize=-1, resumable=True)
        request = self.service.videos().insert(
            part="snippet,status",
            body=body,
            media_body=media
        )
        
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                print(f"Uploaded {int(status.progress() * 100)}%")
                
        video_id = response.get('id')
        
        if thumbnail_path and os.path.exists(thumbnail_path):
            self.set_thumbnail(video_id, thumbnail_path)
            
        return {
            "videoId": video_id,
            "url": f"https://youtu.be/{video_id}",
            "status": "uploaded"
        }
    
    def set_thumbnail(self, video_id: str, thumbnail_path: str) -> bool:
        if not self.service:
            return False
        request = self.service.thumbnails().set(
            videoId=video_id,
            media_body=MediaFileUpload(thumbnail_path)
        )
        request.execute()
        return True
    
    def schedule_publish(self, video_id: str, publish_at_iso: str) -> bool:
        if not self.service:
            return False
            
        request = self.service.videos().list(part="status", id=video_id)
        response = request.execute()
        
        if not response.get('items'):
            return False
            
        video = response['items'][0]
        video['status']['privacyStatus'] = 'private'
        video['status']['publishAt'] = publish_at_iso
        
        update_request = self.service.videos().update(
            part="status",
            body=video
        )
        update_request.execute()
        return True
    
    def get_channel_info(self) -> dict:
        if not self.service:
            if not self.authenticate():
                return {}
        
        request = self.service.channels().list(
            part="snippet,statistics",
            mine=True
        )
        response = request.execute()
        if response.get('items'):
            channel = response['items'][0]
            return {
                "title": channel['snippet']['title'],
                "subscribers": channel['statistics'].get('subscriberCount', '0'),
                "views": channel['statistics'].get('viewCount', '0')
            }
        return {}

