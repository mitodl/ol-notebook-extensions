import json
import tarfile
import uuid
import os

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import boto3
import tornado

NOTEBOOK_BUCKET = ''

class SaveToS3Handler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server

    def _get_workspace_directory_archive(self):
        # Get the workspace directory (Jupyter server root)
        # TODO: We may need to do more here if we decide not to expose the Dockerfile and requirements files
        # This might involve cramming a requirements file in a hidden subdirectory before archiving
        workspace_dir = self.settings.get('serverapp').root_dir
        filename = '{}.tar.gz'.format(uuid.uuid4())
        tar = tarfile.open(filename, mode='w:gz')
        tar.add(workspace_dir, arcname=os.path.basename(workspace_dir))
        tar.close()
        return os.path.join(workspace_dir, filename), tar

    def sync_file_to_s3(self, local_file_path, bucket_name, s3_key):
        s3 = boto3.client('s3')
        s3.upload_file(local_file_path, bucket_name, s3_key)

    def cleanup_tar_file(self, filename):
        os.remove(filename)

    @tornado.web.authenticated
    def get(self):

        '''
        Saves workspace to an S3 bucket
        - Compress an archive of entire workspace
        - Upload the archive to S3
        - Return S3 URL to client?
        '''

        cleanup = False # TODO: Once we're done testing, we can drop this flag and always clean up
        filename, archive = self._get_workspace_directory_archive()
        # TODO: Right now this is probably not gonna work out of box.
        # We need to think through how auth plugs in here so I can read the current user in a semi-secure way
        current_username = self.current_user.username
        # Ideally the course name will be populated automatically if you start from a WIP course
        # We'll allow users to override it if necessary. Need UI to do this.
        # TODO: Pipe a "course name" argument in from the client.
        course_name = 'default_course'
        s3_key = f'{current_username}/{course_name}'
        self.sync_file_to_s3(filename, NOTEBOOK_BUCKET, s3_key)
        if cleanup:
            self.cleanup_tar_file(filename)
        self.finish(json.dumps({
            "data": ( "Saved {} to S3".format(self.settings.get('serverapp').root_dir)),
        }))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    s3_save_pattern = url_path_join(base_url, "ol-jupyter-authoring", "s3-save")
    handlers = [(s3_save_pattern, SaveToS3Handler)]

    web_app.add_handlers(host_pattern, handlers)
