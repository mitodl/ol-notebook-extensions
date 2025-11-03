import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

class SaveToS3Handler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):

        '''
        Saves workspace to an S3 bucket
        - Compress an archive of entire workspace
        - Upload the archive to S3
        - Return S3 URL to client?
        '''

        self.finish(json.dumps({
            "data": ( "Saved to S3"),
        }))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    s3_save_pattern = url_path_join(base_url, "ol-jupyter-authoring", "s3-save")
    handlers = [(s3_save_pattern, SaveToS3Handler)]

    web_app.add_handlers(host_pattern, handlers)
