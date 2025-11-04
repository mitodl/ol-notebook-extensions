import json
import tarfile
import uuid
import os
import time

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import boto3
import tornado

NOTEBOOK_BUCKET = 'ol-devops-sandbox'


class SaveToS3Handler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server

    def _get_workspace_directory_archive(self):
        # Get the workspace directory (Jupyter server root)
        # TODO: We may need to do more here if we decide not to expose the Dockerfile and requirements files
        # This might involve cramming a requirements file in a hidden subdirectory before archiving
        # In general, we're going to persist hidden directories with this command
        # but we'll drop anything we don't expressly add in the dockerfile (i.e. .ipynb_checkpoints)
        workspace_dir = self.settings.get('serverapp').root_dir
        filename = '{}.tar.gz'.format(uuid.uuid4())
        tar = tarfile.open(filename, mode='w:gz')
        tar.add(workspace_dir, arcname=os.path.basename(workspace_dir))
        tar.close()
        return os.path.join(workspace_dir, filename), tar

    def sync_file_to_s3(self, local_file_path, bucket_name, s3_key):
        # This only functions if AWS credentials are discoverable on the server (i.e. .credentials or IAM role)
        s3 = boto3.client('s3')
        s3.upload_file(local_file_path, bucket_name, s3_key)

    def cleanup_tar_file(self, filename):
        os.remove(filename)

    @tornado.web.authenticated
    def get(self):

        '''
        Saves workspace to an S3 bucket. **This is currently synchronous**
        - Compress an archive of entire workspace
        - Upload the archive to S3
        - Return S3 URL to client?
        - Clean up local archive file
        '''

        try:
            archive_start = time.time()
            filename, archive = self._get_workspace_directory_archive()
            archive_end = time.time()
            self.log.info("Created workspace archive in %.2f seconds", archive_end - archive_start)

            # We need to think through how auth plugs in here so I can read the current user in a semi-secure way
            current_username = self.current_user.username

            # Ideally the course name will be populated automatically if you start from a WIP course
            # But we'll allow users to override it if necessary
            course_name = self.get_argument('course','default_course')
            s3_key = f'ol-jupyter-courses/{current_username}/{course_name}.tar.gz'
            s3_sync_start = time.time()
            self.sync_file_to_s3(filename, NOTEBOOK_BUCKET, s3_key)
            s3_sync_end = time.time()

            self.log.info("Synced workspace archive to S3 in %.2f seconds", s3_sync_end - s3_sync_start)
            self.cleanup_tar_file(filename)

            self.finish(json.dumps({
                "data": ("Saved {} to S3 at {}".format(self.settings.get('serverapp').root_dir, s3_key)),
            }))
        except Exception as e:
            self.finish(json.dumps({'error': str(e)}))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    s3_save_pattern = url_path_join(base_url, "ol-jupyter-authoring", "s3-save")
    handlers = [(s3_save_pattern, SaveToS3Handler)]

    web_app.add_handlers(host_pattern, handlers)
