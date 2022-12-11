from setuptools import setup, find_packages


setup(
    name="advancedpathfinding",
    version="1.0.0",
    description="An advanced route planner library",
    url="https://github.com/Hajas42/Advanced-path-finding",
    packages=find_packages(include=('apf*', )),
    entry_points={
        'console_scripts': [
            'apf-server=apf.__main__:main',
        ]
    },
    python_requires=">=3.7",
    install_requires=[
        'flask'
    ],
    include_package_data=True,
    zip_safe=False
)

