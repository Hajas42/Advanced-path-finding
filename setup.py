#!/usr/bin/env python

from distutils.core import setup

setup(
    name='Advanced Path Finding',
    version='1.0',
    long_description=__doc__,
    packages=['apf'],
    include_package_data=True,
    zip_safe=False,
    install_requires=['Flask']
)